import {
  obtenerAccessToken,
  copiarArchivoDrive,
  exportarDocGoogleAPdf,
  hacerPublicoTemporal,
  borrarArchivoDrive,
  subirBufferACarpeta,
  carpetaTemporalFichas,
} from '@/lib/googleDrive';
import { ITEMS_FICHA_FIJOS, type StockItemFicha } from '@/lib/types';

const DOCS_API = 'https://docs.googleapis.com/v1/documents';
const ID_PLANTILLA = '1auU17MrruWH7LBJOLnNF6F0U056ZxDwU';
const MARCA_ASIGNADA = 'X';

/**
 * Rellena la plantilla REAL de Google Docs del justificante (la
 * compartida por el usuario) en vez de generarlo por código con
 * pdf-lib — así el diseño nunca se desvía del original: tipografía,
 * interlineado, colores, tamaños, todo exacto porque es literalmente
 * el mismo documento.
 *
 * Portado del flujo real del sistema de Apps Script anterior
 * (_pltCopiarPlantilla, _pltRellenarTabla, _pltInsertarFirma) al
 * modelo de índices de la API REST de Google Docs: se copia la
 * plantilla, se localiza la fila de cada material por su texto (igual
 * que _pltMaterialDeFila_), y se reemplaza SOLO el marcador de esa
 * celda concreta — no un "reemplazar todo", porque {{X}} y
 * {{OBSERVACIONES}} se repiten una vez por cada una de las 8 filas.
 */
export interface DatosFichaDocs {
  riderNombre: string;
  riderDni: string;
  fecha: string; // dd/mm/aaaa
  hora: string; // HH:mm
  items: StockItemFicha[];
  firmaPngBytes: Uint8Array | null;
}

async function docsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await obtenerAccessToken();
  return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

interface RangoTexto {
  inicio: number;
  fin: number; // exclusivo (endIndex de la API)
}

interface CeldaTexto {
  texto: string;
  rango: RangoTexto;
}

interface FilaTabla {
  filaTexto: string; // texto de la primera celda (nombre del material)
  celdas: CeldaTexto[];
}

function extraerTextoDeCelda(celda: any): CeldaTexto {
  let texto = '';
  let inicio = -1;
  let fin = -1;
  for (const contenido of celda.content ?? []) {
    const parrafo = contenido.paragraph;
    if (!parrafo) continue;
    for (const el of parrafo.elements ?? []) {
      if (el.textRun?.content) {
        texto += el.textRun.content;
        if (inicio === -1) inicio = el.startIndex;
        fin = el.endIndex;
      }
    }
  }
  return { texto, rango: { inicio, fin } };
}

function localizarFilasDeTabla(documento: any): FilaTabla[] {
  const filas: FilaTabla[] = [];
  for (const elemento of documento.body?.content ?? []) {
    const tabla = elemento.table;
    if (!tabla) continue;
    for (const fila of tabla.tableRows ?? []) {
      const celdas = (fila.tableCells ?? []).map(extraerTextoDeCelda);
      if (celdas.length >= 4) filas.push({ filaTexto: celdas[0].texto.trim(), celdas });
    }
  }
  return filas;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Ubica el PRIMER marcador {{clave}} dentro del texto de una celda concreta — nunca en todo el documento. */
function buscarMarcadorEnCelda(celda: CeldaTexto, clave: string): RangoTexto | null {
  const patron = new RegExp(`\\{\\{\\s*${clave}\\s*\\}\\}`, 'i');
  const m = celda.texto.match(patron);
  if (!m || m.index === undefined) return null;
  return { inicio: celda.rango.inicio + m.index, fin: celda.rango.inicio + m.index + m[0].length };
}

function buscarMarcadorEnCuerpo(documento: any, clave: string): RangoTexto | null {
  const patron = new RegExp(`\\{\\{\\s*${clave}\\s*\\}\\}`, 'i');
  for (const elemento of documento.body?.content ?? []) {
    const parrafo = elemento.paragraph;
    if (!parrafo) continue;
    for (const el of parrafo.elements ?? []) {
      const contenido = el.textRun?.content;
      if (contenido) {
        const m = contenido.match(patron);
        if (m && m.index !== undefined) {
          return { inicio: el.startIndex + m.index, fin: el.startIndex + m.index + m[0].length };
        }
      }
    }
  }
  return null;
}

export async function generarFichaDesdeGoogleDocs(datos: DatosFichaDocs, carpetaDestinoId: string, nombreArchivo: string): Promise<string> {
  const carpetaTemp = await carpetaTemporalFichas();

  // 1. Copiar la plantilla (equivalente a _pltCopiarPlantilla()).
  const idCopia = await copiarArchivoDrive(ID_PLANTILLA, `${nombreArchivo}_TMP`, carpetaTemp);

  try {
    // 2. Datos únicos del rider (FECHA/HORA/TRABAJADOR/DNI) — un
    // replaceAllText normal basta, no dependen de posición de celda.
    const requestsGlobales = [
      { replaceAllText: { containsText: { text: '{{FECHA}}', matchCase: false }, replaceText: datos.fecha } },
      { replaceAllText: { containsText: { text: '{{HORA}}', matchCase: false }, replaceText: datos.hora } },
      { replaceAllText: { containsText: { text: '{{TRABAJADOR}}', matchCase: false }, replaceText: datos.riderNombre } },
      { replaceAllText: { containsText: { text: '{{DNI}}', matchCase: false }, replaceText: datos.riderDni } },
    ];
    const respGlobal = await docsFetch(`${DOCS_API}/${idCopia}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: requestsGlobales }) });
    if (!respGlobal.ok) throw new Error(`No se pudieron rellenar los datos del rider (HTTP ${respGlobal.status}): ${await respGlobal.text()}`);

    // 3. Marcadores de la tabla: se leen los índices YA ACTUALIZADOS
    // (después del reemplazo global del paso 2, que movió posiciones)
    // para que los rangos que se calculen aquí sean válidos.
    const respLeer = await docsFetch(`${DOCS_API}/${idCopia}`);
    if (!respLeer.ok) throw new Error(`No se pudo leer la plantilla copiada (HTTP ${respLeer.status}): ${await respLeer.text()}`);
    const documento = await respLeer.json();
    const filas = localizarFilasDeTabla(documento);

    type Reemplazo = { rango: RangoTexto; texto: string };
    const reemplazos: Reemplazo[] = [];
    const itemPorClave = new Map(datos.items.map((it) => [it.itemClave, it]));

    for (const def of ITEMS_FICHA_FIJOS) {
      const fila = filas.find((f) => normalizar(f.filaTexto) === normalizar(def.etiqueta));
      if (!fila) continue; // si el texto de la plantilla cambia algún día, esa fila no se rellena, pero el resto sigue funcionando
      const it = itemPorClave.get(def.clave);
      const marca = it?.marca ?? null;

      // Columnas confirmadas contra el documento real: 1=Asignación, 2=Dev. buen estado, 3=Dev. mal estado, 4=Observaciones.
      const colAsig = fila.celdas[1] && buscarMarcadorEnCelda(fila.celdas[1], 'X');
      if (colAsig) reemplazos.push({ rango: colAsig, texto: marca === 'asignacion' ? MARCA_ASIGNADA : '' });

      const colOk = fila.celdas[2] && buscarMarcadorEnCelda(fila.celdas[2], 'X');
      if (colOk) reemplazos.push({ rango: colOk, texto: marca === 'devolucion_ok' ? MARCA_ASIGNADA : '' });

      const colMal = fila.celdas[3] && buscarMarcadorEnCelda(fila.celdas[3], 'X');
      if (colMal) reemplazos.push({ rango: colMal, texto: marca === 'devolucion_mal' ? MARCA_ASIGNADA : '' });

      const colObs = fila.celdas[4] && buscarMarcadorEnCelda(fila.celdas[4], 'OBSERVACIONES');
      if (colObs) reemplazos.push({ rango: colObs, texto: it?.observaciones?.trim() ?? '' });
    }

    // De MAYOR a MENOR índice: cada deleteContentRange/insertText
    // cambia la longitud del texto y desplazaría los índices de los
    // reemplazos siguientes si se aplicaran de menor a mayor.
    reemplazos.sort((a, b) => b.rango.inicio - a.rango.inicio);
    const requestsCeldas = reemplazos.flatMap((r) => [
      { deleteContentRange: { range: { startIndex: r.rango.inicio, endIndex: r.rango.fin } } },
      ...(r.texto ? [{ insertText: { location: { index: r.rango.inicio }, text: r.texto } }] : []),
    ]);

    if (requestsCeldas.length > 0) {
      const respCeldas = await docsFetch(`${DOCS_API}/${idCopia}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: requestsCeldas }) });
      if (!respCeldas.ok) throw new Error(`No se pudo rellenar la tabla de materiales (HTTP ${respCeldas.status}): ${await respCeldas.text()}`);
    }

    // 4. Firma — se inserta como imagen inline en el marcador
    // {{FIRMA DEL TRABAJADOR}}, mismo respaldo "inline" que el propio
    // sistema anterior ya contemplaba cuando el posicionamiento
    // flotante calibrado a mano no aplicaba.
    if (datos.firmaPngBytes) {
      await insertarFirma(idCopia, datos.firmaPngBytes, carpetaTemp);
    } else {
      await docsFetch(`${DOCS_API}/${idCopia}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ replaceAllText: { containsText: { text: '{{FIRMA DEL TRABAJADOR}}', matchCase: false }, replaceText: '' } }] }),
      });
    }

    // 5. Exportar a PDF y subir a la carpeta real de destino (la del gestor).
    const pdfBuffer = await exportarDocGoogleAPdf(idCopia);
    const idPdfFinal = await subirBufferACarpeta(carpetaDestinoId, `${nombreArchivo}.pdf`, pdfBuffer, 'application/pdf');

    return idPdfFinal;
  } finally {
    // La copia de trabajo siempre se borra, tanto si todo salió bien
    // como si algo falló a mitad de camino — nunca debe quedar un
    // archivo temporal huérfano en Drive.
    await borrarArchivoDrive(idCopia);
  }
}

async function insertarFirma(idDocumento: string, firmaPngBytes: Uint8Array, carpetaTemp: string): Promise<void> {
  const idFirmaTemp = await subirBufferACarpeta(carpetaTemp, `firma_temp_${Date.now()}.png`, Buffer.from(firmaPngBytes), 'image/png');
  try {
    const urlPublica = await hacerPublicoTemporal(idFirmaTemp);

    const respLeer = await docsFetch(`${DOCS_API}/${idDocumento}`);
    const documento = await respLeer.json();
    const rango = buscarMarcadorEnCuerpo(documento, 'FIRMA DEL TRABAJADOR');
    if (!rango) return; // si no se encuentra el marcador, se sigue sin firma en vez de romper toda la ficha

    const respInsertar = await docsFetch(`${DOCS_API}/${idDocumento}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          { deleteContentRange: { range: { startIndex: rango.inicio, endIndex: rango.fin } } },
          {
            insertInlineImage: {
              uri: urlPublica,
              location: { index: rango.inicio },
              objectSize: { height: { magnitude: 40, unit: 'PT' }, width: { magnitude: 110, unit: 'PT' } },
            },
          },
        ],
      }),
    });
    if (!respInsertar.ok) {
      // No se interrumpe toda la ficha por un fallo al insertar la
      // firma (ej. la URL pública aún no propagó) — se deja constancia
      // en el log del servidor y el PDF sale sin firma antes que fallar del todo.
      console.error('[insertarFirma] No se pudo insertar la imagen de firma:', await respInsertar.text());
    }
  } finally {
    await borrarArchivoDrive(idFirmaTemp);
  }
}
