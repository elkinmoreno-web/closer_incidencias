import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { StockMaterialFicha, StockEstadoFicha } from '@/lib/types';

/**
 * Genera el PDF de entrega/devolución de material, equivalente al
 * documento que producía la plantilla de Google Docs del sistema
 * anterior (marcadores {{FECHA}}, {{TRABAJADOR}}, tabla de
 * materiales con columnas Asignación/Devolución OK/Devolución mal
 * estado, y la firma insertada al final) — aquí construido directo
 * con pdf-lib en vez de copiar una plantilla de Docs, porque ese
 * flujo no existe fuera de Google Workspace.
 */
export interface DatosFichaPdf {
  centroNombre: string;
  riderNombre: string;
  riderDni: string;
  fecha: string; // dd/mm/aaaa, ya formateada
  hora: string; // HH:mm
  estado: StockEstadoFicha;
  materiales: StockMaterialFicha[];
  firmaPngBytes: Uint8Array | null; // null = sin firma capturada
}

const MARGEN = 50;
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;

export async function generarFichaPdf(datos: DatosFichaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = ALTO_PAGINA - MARGEN;

  // --- Cabecera ---
  page.drawText('Closer Logistics — Ficha de material', { x: MARGEN, y, size: 16, font: fontBold, color: rgb(0.02, 0.29, 0.29) });
  y -= 22;
  page.drawText(datos.estado, { x: MARGEN, y, size: 11, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  y -= 28;

  // --- Datos del rider ---
  y = dibujarPar(page, fontRegular, fontBold, MARGEN, y, 'Fecha', `${datos.fecha}  ${datos.hora}`);
  y = dibujarPar(page, fontRegular, fontBold, MARGEN, y, 'Centro', datos.centroNombre);
  y = dibujarPar(page, fontRegular, fontBold, MARGEN, y, 'Trabajador', datos.riderNombre);
  y = dibujarPar(page, fontRegular, fontBold, MARGEN, y, 'DNI / NIE', datos.riderDni);
  y -= 16;

  // --- Tabla de materiales: Material | Asignación | Dev. OK | Dev. mal estado ---
  // Mismo esquema de 4 columnas que la plantilla de Docs original.
  const colX = [MARGEN, MARGEN + 220, MARGEN + 320, MARGEN + 410];
  const anchoTabla = ANCHO_PAGINA - MARGEN * 2;

  page.drawRectangle({ x: MARGEN, y: y - 18, width: anchoTabla, height: 20, color: rgb(0.94, 0.96, 0.96) });
  page.drawText('Material', { x: colX[0] + 4, y: y - 13, size: 9, font: fontBold });
  page.drawText('Asignación', { x: colX[1] + 4, y: y - 13, size: 9, font: fontBold });
  page.drawText('Dev. OK', { x: colX[2] + 4, y: y - 13, size: 9, font: fontBold });
  page.drawText('Dev. mal estado', { x: colX[3] + 4, y: y - 13, size: 9, font: fontBold });
  y -= 20;

  for (const m of datos.materiales) {
    const esAsignacion = datos.estado === 'Asignación';
    const esDevOk = datos.estado === 'Devolución buen estado';
    const esDevMal = datos.estado === 'Devolución mal estado';

    page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + anchoTabla, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 16;

    const etiquetaMaterial = m.cantidad > 1 ? `${m.materialTitulo} (${m.cantidad})` : m.materialTitulo;
    page.drawText(etiquetaMaterial, { x: colX[0] + 4, y, size: 9, font: fontRegular });
    if (esAsignacion) page.drawText('X', { x: colX[1] + 4, y, size: 9, font: fontBold });
    if (esDevOk) page.drawText('X', { x: colX[2] + 4, y, size: 9, font: fontBold });
    if (esDevMal) page.drawText('X', { x: colX[3] + 4, y, size: 9, font: fontBold });

    if (m.observaciones) {
      y -= 13;
      page.drawText(`Obs: ${m.observaciones}`, { x: colX[0] + 4, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 6;
  }
  page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + anchoTabla, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

  // --- Firma ---
  y -= 60;
  page.drawText('Firma del trabajador:', { x: MARGEN, y: y + 40, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + 220, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });

  if (datos.firmaPngBytes) {
    try {
      const imagenFirma = await doc.embedPng(datos.firmaPngBytes);
      // Mismo criterio que STK_PLT.FIRMA_MAX_ANCHO/ALTO del sistema
      // anterior: se limita el tamaño máximo y se escala manteniendo proporción.
      const anchoMax = 180;
      const altoMax = 60;
      const escala = Math.min(anchoMax / imagenFirma.width, altoMax / imagenFirma.height, 1);
      const w = imagenFirma.width * escala;
      const h = imagenFirma.height * escala;
      page.drawImage(imagenFirma, { x: MARGEN + 4, y: y + 4, width: w, height: h });
    } catch {
      // Si la imagen de firma viene corrupta, se deja el hueco en
      // blanco (con la línea ya dibujada) en vez de romper todo el PDF.
    }
  }

  return doc.save();
}

function dibujarPar(page: PDFPage, fontRegular: PDFFont, fontBold: PDFFont, x: number, y: number, label: string, valor: string): number {
  page.drawText(`${label}:`, { x, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(valor, { x: x + 90, y, size: 10, font: fontRegular });
  return y - 16;
}
