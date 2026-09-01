import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { ITEMS_FICHA_FIJOS, type StockItemFicha } from '@/lib/types';

/**
 * Genera el "JUSTIFICANTE DE ENTREGA DE EQUIPOS O MATERIALES DE
 * EMPRESA" — réplica fiel de la plantilla oficial de Closer Logistics
 * S.L. (mismos 8 ítems fijos, mismo bloque legal, misma tabla de
 * importes de franquicia, mismo pie de firma electrónica) construida
 * directo con pdf-lib en vez de una plantilla de Google Docs, porque
 * ese flujo no existe fuera de Google Workspace.
 *
 * El logo de la empresa no se reproduce como imagen (no se dispone
 * del archivo) — se sustituye por el nombre de la empresa en texto,
 * en el mismo lugar del membrete.
 */
export interface DatosFichaPdf {
  centroNombre: string;
  riderNombre: string;
  riderDni: string;
  fecha: string; // dd/mm/aaaa, ya formateada
  hora: string; // HH:mm
  items: StockItemFicha[];
  firmaPngBytes: Uint8Array | null; // null = sin firma capturada
}

const MARGEN = 48;
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;
const GRIS_BORDE = rgb(0.75, 0.75, 0.75);
const GRIS_TEXTO = rgb(0.25, 0.25, 0.25);
const AMARILLO_OBS = rgb(1, 0.95, 0.6);

const TEXTO_LEGAL_1 =
  'El trabajador arriba identificado recibe de su empresa, los materiales, en buen estado de conservación, necesario u obligatorios en su puesto de trabajo, el cual, al terminar la relación contractual con la empresa, se compromete a realizar la devolución de los materiales asignados.';
const TEXTO_LEGAL_2 =
  'En caso de no realizar la devolución de los materiales de la empresa anteriormente entregados en el plazo de 48 horas desde que se produzca la extinción de la relación laboral, será considerado APROPIACIÓN INDEBIDA por lo que la empresa procederá a la interposición de la correspondiente DENUNCIA PENAL EN EL JUZGADO DE INSTRUCCIÓN.';
const TEXTO_LEGAL_3 = 'Adicionalmente, de no realizar la devolución de los materiales se efectuará cobro de franquicia, según los siguientes importes:';
const TEXTO_FRANQUICIAS =
  'Mochila Térmica 100 € / Funda de lluvia 20€ Soporte de Móvil 15 € / Traje Chubasquero 20 € / Móvil Pérdida total 200 € / Pantalla Móvil 100 € / Tarjeta repostaje 10 € / Funda de lluvia mochila 20 € / Chaleco Reflectante 10€ / Soporte de Bici 150€';

function partirTexto(texto: string, font: PDFFont, size: number, anchoMax: number): string[] {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) > anchoMax && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function generarFichaPdf(datos: DatosFichaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = ALTO_PAGINA - MARGEN;

  // --- Membrete (sin logo real, texto en su lugar) ---
  page.drawText('CLOSER', { x: MARGEN, y, size: 20, font: bold, color: rgb(0.02, 0.29, 0.29) });
  y -= 14;
  page.drawText('INNOVATIVE DELIVERY EXPERIENCE', { x: MARGEN, y, size: 6, font: regular, color: GRIS_TEXTO });
  y -= 26;

  // --- Título ---
  page.drawText('JUSTIFICANTE DE ENTREGA DE EQUIPOS O MATERIALES DE EMPRESA', { x: MARGEN, y, size: 12, font: bold });
  y -= 6;
  page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + ANCHO_UTIL, y }, thickness: 0.7 });
  y -= 20;

  // --- Cabecera de empresa ---
  page.drawText('EMPRESA: CLOSER LOGISTICS S.L', { x: MARGEN, y, size: 9, font: bold });
  y -= 12;
  page.drawText('CIF: B-88225859', { x: MARGEN, y, size: 9, font: bold });
  y -= 18;

  page.drawText('FECHA:', { x: MARGEN, y, size: 9, font: bold });
  page.drawText(datos.fecha, { x: MARGEN + 40, y, size: 9, font: regular });
  page.drawText('HORA:', { x: MARGEN + 140, y, size: 9, font: bold });
  page.drawText(datos.hora, { x: MARGEN + 175, y, size: 9, font: regular });
  y -= 16;

  page.drawText('TRABAJADOR:', { x: MARGEN, y, size: 9, font: bold });
  page.drawText(datos.riderNombre, { x: MARGEN + 68, y, size: 9, font: italic });
  page.drawText('DNI / NIE', { x: MARGEN + 320, y, size: 9, font: bold });
  page.drawText(datos.riderDni, { x: MARGEN + 380, y, size: 9, font: italic });
  y -= 22;

  // --- Tabla de 8 ítems fijos: Material | Asignación | Dev. buen estado | Dev. mal estado | Observaciones ---
  const colMaterial = MARGEN;
  const colAsig = MARGEN + 155;
  const colDevOk = MARGEN + 225;
  const colDevMal = MARGEN + 300;
  const colObs = MARGEN + 375;
  const altoFila = 26;
  const yTablaInicio = y;

  page.drawText('Materiales', { x: colMaterial + 4, y: y - 12, size: 8.5, font: bold });
  page.drawText('Asignación', { x: colAsig + 4, y: y - 12, size: 8, font: bold });
  page.drawText('Devolución', { x: colDevOk + 4, y: y - 9, size: 7.5, font: bold });
  page.drawText('buen estado', { x: colDevOk + 4, y: y - 17, size: 7.5, font: bold });
  page.drawText('Devolución', { x: colDevMal + 4, y: y - 9, size: 7.5, font: bold });
  page.drawText('mal estado', { x: colDevMal + 4, y: y - 17, size: 7.5, font: bold });
  page.drawText('OBSERVACIONES', { x: colObs + 4, y: y - 12, size: 8, font: bold });
  y -= altoFila;

  const itemPorClave = new Map(datos.items.map((it) => [it.itemClave, it]));

  for (const def of ITEMS_FICHA_FIJOS) {
    const it = itemPorClave.get(def.clave);
    const marca = it?.marca ?? null;

    page.drawText(def.etiqueta, { x: colMaterial + 4, y: y - 15, size: 8.5, font: bold, color: GRIS_TEXTO });
    page.drawText(marca === 'asignacion' ? '( X )' : '(   )', { x: colAsig + 8, y: y - 15, size: 8.5, font: regular });
    page.drawText(marca === 'devolucion_ok' ? '( X )' : '(   )', { x: colDevOk + 8, y: y - 15, size: 8.5, font: regular });
    page.drawText(marca === 'devolucion_mal' ? '( X )' : '(   )', { x: colDevMal + 8, y: y - 15, size: 8.5, font: regular });

    if (it?.observaciones) {
      page.drawRectangle({ x: colObs + 2, y: y - altoFila + 4, width: ANCHO_UTIL - (colObs - MARGEN) - 4, height: altoFila - 8, color: AMARILLO_OBS });
      page.drawText(it.observaciones.slice(0, 42), { x: colObs + 5, y: y - 15, size: 7.5, font: regular });
    }

    y -= altoFila;
  }

  const yTablaFin = y;
  // Bordes de la tabla (rejilla completa)
  const columnas = [colMaterial, colAsig, colDevOk, colDevMal, colObs, MARGEN + ANCHO_UTIL];
  for (const cx of columnas) {
    page.drawLine({ start: { x: cx, y: yTablaInicio }, end: { x: cx, y: yTablaFin }, thickness: 0.5, color: GRIS_BORDE });
  }
  for (let fila = 0; fila <= ITEMS_FICHA_FIJOS.length + 1; fila++) {
    const ly = yTablaInicio - fila * altoFila;
    page.drawLine({ start: { x: MARGEN, y: ly }, end: { x: MARGEN + ANCHO_UTIL, y: ly }, thickness: 0.5, color: GRIS_BORDE });
  }

  y -= 18;

  // --- Bloque legal ---
  for (const linea of partirTexto(TEXTO_LEGAL_1, regular, 8, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8, font: regular, color: GRIS_TEXTO });
    y -= 11;
  }
  y -= 4;
  for (const linea of partirTexto(TEXTO_LEGAL_2, bold, 8, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8, font: bold });
    y -= 11;
  }
  y -= 6;
  for (const linea of partirTexto(TEXTO_LEGAL_3, regular, 8, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8, font: regular, color: GRIS_TEXTO });
    y -= 11;
  }
  y -= 4;
  for (const linea of partirTexto(TEXTO_FRANQUICIAS, bold, 7.5, ANCHO_UTIL)) {
    const anchoLinea = bold.widthOfTextAtSize(linea, 7.5);
    page.drawText(linea, { x: MARGEN + (ANCHO_UTIL - anchoLinea) / 2, y, size: 7.5, font: bold });
    y -= 10;
  }

  y -= 26;

  // --- Firma ---
  page.drawText('RESPONSABLE DE LA EMPRESA', { x: MARGEN + 20, y, size: 8, font: bold });
  page.drawText('TRABAJADOR', { x: MARGEN + 340, y, size: 8, font: bold });
  y -= 14;
  page.drawText('CLOSER', { x: MARGEN + 20, y, size: 11, font: bold, color: rgb(0.02, 0.29, 0.29) });
  page.drawText('CLOSER LOGISTICS S.L.', { x: MARGEN, y: y - 12, size: 6, font: regular });
  page.drawText('B-88225859', { x: MARGEN, y: y - 20, size: 6, font: regular });
  page.drawText('C/ Dehesa Vieja, 56', { x: MARGEN, y: y - 28, size: 6, font: regular });
  page.drawText('28052 Madrid', { x: MARGEN, y: y - 36, size: 6, font: regular });

  page.drawText('NOMBRE:', { x: MARGEN + 340, y, size: 8, font: bold });
  page.drawText(datos.riderNombre, { x: MARGEN + 385, y, size: 8, font: regular });
  page.drawText('FIRMA:', { x: MARGEN + 340, y: y - 14, size: 8, font: bold });

  if (datos.firmaPngBytes) {
    try {
      const imagenFirma = await doc.embedPng(datos.firmaPngBytes);
      const anchoMax = 130;
      const altoMax = 45;
      const escala = Math.min(anchoMax / imagenFirma.width, altoMax / imagenFirma.height, 1);
      const w = imagenFirma.width * escala;
      const h = imagenFirma.height * escala;
      page.drawImage(imagenFirma, { x: MARGEN + 385, y: y - 14 - h, width: w, height: h });
    } catch {
      // Si la imagen de firma viene corrupta, se deja el hueco en blanco.
    }
  }

  y -= 70;
  page.drawText('FIRMADO ELECTRÓNICAMENTE de conformidad con el Reglamento (UE) nº910/2014(eIDAS)', { x: MARGEN + 60, y, size: 6.5, font: italic, color: GRIS_TEXTO });
  page.drawText(`Firmante: ${datos.riderNombre} | ${datos.riderDni} | Fecha/Hora: ${datos.fecha}, ${datos.hora}`, {
    x: MARGEN + 60,
    y: y - 10,
    size: 6.5,
    font: italic,
    color: GRIS_TEXTO,
  });

  return doc.save();
}
