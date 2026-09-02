import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ITEMS_FICHA_FIJOS, type StockItemFicha } from '@/lib/types';

/**
 * Genera el "JUSTIFICANTE DE ENTREGA DE EQUIPOS O MATERIALES DE
 * EMPRESA" — réplica del documento real de Word compartido por el
 * usuario (Copia_de_Planilla_de_asignacion_de_Materiales_2025.docx),
 * confirmada visualmente contra el render exacto del .docx: mismos 8
 * ítems, misma tabla, mismo bloque legal, mismo pie de firma
 * eIDAS — con el logo real de la empresa insertado como imagen (antes
 * se sustituía por texto porque no se disponía del archivo del logo).
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
const GRIS_BORDE = rgb(0.85, 0.85, 0.85); // bordes de tabla muy sutiles, como en el original
const GRIS_TEXTO = rgb(0.2, 0.2, 0.2);
const AMARILLO_OBS = rgb(1, 0.92, 0.4); // mismo tono de resaltado del documento real

const TEXTO_LEGAL_1 =
  'El trabajador arriba identificado recibe de su empresa, los materiales, en buen estado de conservación, necesario u obligatorios en su puesto de trabajo, El cual, al terminar la relación contractual con la empresa, se compromete a realizar la devolución de los materiales asignados.';
const TEXTO_LEGAL_2 =
  'En caso de no realizar la devolución de los materiales de la empresa anteriormente entregados en el plazo de 48 horas desde que se produzca la extinción de la relación laboral, será considerado APROPIACIÓN INDEBIDA por lo que la empresa procederá a la interposición de la correspondiente DENUNCIA PENAL EN EL JUZGADO DE INSTRUCCIÓN.';
const TEXTO_LEGAL_3 = 'Adicionalmente, de no realizar la devolución de los materiales se efectuará cobro de franquicia, según los siguientes importes:';
const TEXTO_FRANQUICIAS_L1 = 'Mochila Térmica 100 € / Funda de lluvia 20€ Soporte de Móvil 15 € / Traje Chubasquero 20 € / Móvil Pérdida total 200 €';
const TEXTO_FRANQUICIAS_L2 = '/ Pantalla Móvil 100 € / Tarjeta repostaje 10 € / Funda de lluvia mochila 20 € / Chaleco Reflectante 10€ / Soporte de Bici 150€';

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

function leerLogo(nombreArchivo: string): Buffer {
  return readFileSync(join(process.cwd(), 'public', 'plantillas', nombreArchivo));
}

export async function generarFichaPdf(datos: DatosFichaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = ALTO_PAGINA - MARGEN;

  // --- Logo principal (real, no texto sustituto) ---
  try {
    const logoPrincipal = await doc.embedPng(leerLogo('logo-principal.png'));
    const anchoLogo = 130;
    const altoLogo = anchoLogo / (logoPrincipal.width / logoPrincipal.height);
    page.drawImage(logoPrincipal, { x: MARGEN, y: y - altoLogo, width: anchoLogo, height: altoLogo });
    y -= altoLogo + 14;
  } catch {
    // Si el logo no se puede leer (despliegue sin el archivo), se sigue sin membrete gráfico en vez de fallar toda la ficha.
    page.drawText('CLOSER', { x: MARGEN, y, size: 20, font: bold, color: rgb(0.02, 0.29, 0.29) });
    y -= 26;
  }

  // --- Título (subrayado, como el original) ---
  const tituloTexto = 'JUSTIFICANTE DE ENTREGA DE EQUIPOS O MATERIALES DE EMPRESA';
  page.drawText(tituloTexto, { x: MARGEN, y, size: 12, font: bold });
  const anchoTitulo = bold.widthOfTextAtSize(tituloTexto, 12);
  page.drawLine({ start: { x: MARGEN, y: y - 2 }, end: { x: MARGEN + anchoTitulo, y: y - 2 }, thickness: 0.8 });
  y -= 26;

  // --- Cabecera de empresa ---
  page.drawText('EMPRESA: CLOSER LOGISTICS S.L', { x: MARGEN, y, size: 9, font: bold });
  y -= 12;
  page.drawText('CIF: B-88225859', { x: MARGEN, y, size: 9, font: bold });
  y -= 20;

  page.drawText('FECHA:', { x: MARGEN, y, size: 9, font: bold });
  page.drawText(datos.fecha, { x: MARGEN + 40, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page.drawText('HORA:', { x: MARGEN + 140, y, size: 9, font: bold });
  page.drawText(datos.hora, { x: MARGEN + 172, y, size: 9, font: italic });
  y -= 16;

  page.drawText('TRABAJADOR:', { x: MARGEN, y, size: 9, font: bold });
  page.drawText(datos.riderNombre, { x: MARGEN + 68, y, size: 9, font: italic });
  page.drawText('DNI / NIE', { x: MARGEN + 320, y, size: 9, font: bold });
  page.drawText(datos.riderDni, { x: MARGEN + 375, y, size: 9, font: italic });
  y -= 22;

  // --- Tabla de 8 ítems fijos: Material | Asignación | Dev. buen estado | Dev. mal estado | Observaciones ---
  const colMaterial = MARGEN;
  const colAsig = MARGEN + 150;
  const colDevOk = MARGEN + 225;
  const colDevMal = MARGEN + 310;
  const colObs = MARGEN + 395;
  const altoCabecera = 30;
  const altoFila = 26;
  const yTablaInicio = y;

  // Cabecera con fondo blanco (no oscuro) y texto negro, como el original.
  page.drawText('Materiales', { x: colMaterial + 6, y: y - 17, size: 8.5, font: bold });
  page.drawText('Asignación', { x: colAsig + 6, y: y - 17, size: 8, font: bold });
  page.drawText('Devolución', { x: colDevOk + 6, y: y - 13, size: 7.5, font: bold });
  page.drawText('buen estado', { x: colDevOk + 6, y: y - 22, size: 7.5, font: bold });
  page.drawText('Devolución', { x: colDevMal + 6, y: y - 13, size: 7.5, font: bold });
  page.drawText('mal estado', { x: colDevMal + 6, y: y - 22, size: 7.5, font: bold });
  const tituloObs = 'OBSERVACIONES';
  const anchoObs = bold.widthOfTextAtSize(tituloObs, 9);
  const colObsAncho = ANCHO_UTIL - (colObs - MARGEN);
  page.drawText(tituloObs, { x: colObs + (colObsAncho - anchoObs) / 2, y: y - 17, size: 9, font: bold });
  y -= altoCabecera;

  const itemPorClave = new Map(datos.items.map((it) => [it.itemClave, it]));

  for (const def of ITEMS_FICHA_FIJOS) {
    const it = itemPorClave.get(def.clave);
    const marca = it?.marca ?? null;

    page.drawText(def.etiqueta, { x: colMaterial + 6, y: y - 16, size: 9, font: bold });

    // "( {{X}} )" — con espacios y paréntesis en negrita, igual que el original.
    function celdaMarca(cx: number, marcada: boolean) {
      page.drawText('(', { x: cx, y: y - 16, size: 9, font: bold });
      if (marcada) page.drawText('X', { x: cx + 10, y: y - 16, size: 9, font: bold });
      page.drawText(')', { x: cx + 20, y: y - 16, size: 9, font: bold });
    }
    celdaMarca(colAsig + 10, marca === 'asignacion');
    celdaMarca(colDevOk + 10, marca === 'devolucion_ok');
    celdaMarca(colDevMal + 10, marca === 'devolucion_mal');

    // Observaciones: resaltado en amarillo SIEMPRE (como el marcador
    // del documento original, que aparece resaltado exista o no
    // texto), no solo cuando el admin escribió algo.
    page.drawRectangle({ x: colObs + 3, y: y - altoFila + 5, width: colObsAncho - 6, height: altoFila - 10, color: AMARILLO_OBS });
    if (it?.observaciones) {
      page.drawText(it.observaciones.slice(0, 44), { x: colObs + 6, y: y - 16, size: 7.5, font: regular });
    }

    y -= altoFila;
  }

  const yTablaFin = y;
  const columnas = [colMaterial, colAsig, colDevOk, colDevMal, colObs, MARGEN + ANCHO_UTIL];
  for (const cx of columnas) {
    page.drawLine({ start: { x: cx, y: yTablaInicio }, end: { x: cx, y: yTablaFin }, thickness: 0.5, color: GRIS_BORDE });
  }
  page.drawLine({ start: { x: MARGEN, y: yTablaInicio }, end: { x: MARGEN + ANCHO_UTIL, y: yTablaInicio }, thickness: 0.5, color: GRIS_BORDE });
  page.drawLine({ start: { x: MARGEN, y: yTablaInicio - altoCabecera }, end: { x: MARGEN + ANCHO_UTIL, y: yTablaInicio - altoCabecera }, thickness: 0.5, color: GRIS_BORDE });
  for (let fila = 1; fila <= ITEMS_FICHA_FIJOS.length; fila++) {
    const ly = yTablaInicio - altoCabecera - fila * altoFila;
    page.drawLine({ start: { x: MARGEN, y: ly }, end: { x: MARGEN + ANCHO_UTIL, y: ly }, thickness: 0.5, color: GRIS_BORDE });
  }

  y -= 16;

  // --- Bloque legal (compacto, poco espaciado entre líneas, como el original) ---
  for (const linea of partirTexto(TEXTO_LEGAL_1, regular, 8.5, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8.5, font: regular, color: GRIS_TEXTO });
    y -= 11;
  }
  for (const linea of partirTexto(TEXTO_LEGAL_2, bold, 8.5, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8.5, font: bold });
    y -= 11;
  }
  y -= 3;
  for (const linea of partirTexto(TEXTO_LEGAL_3, regular, 8.5, ANCHO_UTIL)) {
    page.drawText(linea, { x: MARGEN, y, size: 8.5, font: regular, color: GRIS_TEXTO });
    y -= 11;
  }
  y -= 6;
  for (const linea of [TEXTO_FRANQUICIAS_L1, TEXTO_FRANQUICIAS_L2]) {
    const anchoLinea = bold.widthOfTextAtSize(linea, 8);
    page.drawText(linea, { x: MARGEN + (ANCHO_UTIL - anchoLinea) / 2, y, size: 8, font: bold });
    y -= 13;
  }

  y -= 20;

  // --- Firma ---
  page.drawText('RESPONSABLE DE LA EMPRESA', { x: MARGEN + 20, y, size: 8, font: bold });
  page.drawText('TRABAJADOR', { x: MARGEN + 340, y, size: 8, font: bold });
  y -= 16;

  try {
    const logoFirma = await doc.embedPng(leerLogo('logo-firma-pequeno.png'));
    const anchoLogoFirma = 62;
    const altoLogoFirma = anchoLogoFirma / (logoFirma.width / logoFirma.height);
    page.drawImage(logoFirma, { x: MARGEN + 10, y: y - altoLogoFirma, width: anchoLogoFirma, height: altoLogoFirma });
  } catch {
    page.drawText('CLOSER LOGISTICS S.L.', { x: MARGEN, y: y - 12, size: 6, font: regular });
    page.drawText('B-88225859', { x: MARGEN, y: y - 20, size: 6, font: regular });
    page.drawText('C/ Dehesa Vieja, 56', { x: MARGEN, y: y - 28, size: 6, font: regular });
    page.drawText('28052 Madrid', { x: MARGEN, y: y - 36, size: 6, font: regular });
  }

  page.drawText('NOMBRE:', { x: MARGEN + 340, y, size: 8, font: bold });
  page.drawText(datos.riderNombre, { x: MARGEN + 385, y, size: 8, font: regular });
  page.drawText('FIRMA:', { x: MARGEN + 340, y: y - 13, size: 8, font: bold });

  if (datos.firmaPngBytes) {
    try {
      const imagenFirma = await doc.embedPng(datos.firmaPngBytes);
      const anchoMax = 120;
      const altoMax = 42;
      const escala = Math.min(anchoMax / imagenFirma.width, altoMax / imagenFirma.height, 1);
      const w = imagenFirma.width * escala;
      const h = imagenFirma.height * escala;
      page.drawImage(imagenFirma, { x: MARGEN + 385, y: y - 13 - h, width: w, height: h });
    } catch {
      // Si la imagen de firma viene corrupta, se deja el hueco en blanco.
    }
  }

  y -= 68;
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
