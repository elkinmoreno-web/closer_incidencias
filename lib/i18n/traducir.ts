import es from './dictionaries/es';
import en from './dictionaries/en';
import type { ClaveTraduccion } from './dictionaries/es';
import type { Idioma } from './resolverIdioma';

const diccionarios: Record<Idioma, Record<ClaveTraduccion, string>> = { es, en };

/**
 * Traduce una clave al idioma dado. Uso en Server Components:
 *   const idioma = await resolverIdioma();
 *   const t = crearTraductor(idioma);
 *   t('comun.guardar')
 *
 * Para Client Components, ver `components/i18n/IdiomaProvider.tsx` —
 * el idioma ya resuelto se pasa desde el servidor, nunca se vuelve a
 * calcular en el navegador.
 */
export function crearTraductor(idioma: Idioma) {
  const diccionario = diccionarios[idioma] ?? diccionarios.es;
  return function t(clave: ClaveTraduccion): string {
    return diccionario[clave] ?? diccionarios.es[clave] ?? clave;
  };
}

export type Traductor = ReturnType<typeof crearTraductor>;

/**
 * Elige el nombre correcto de un motivo (o cualquier dato con
 * nombre/nombre_en) según el idioma — con el nombre en español como
 * respaldo si el de inglés no está rellenado. Reutilizable en
 * cualquier lugar donde se muestre un motivo (selects, listas, PDFs).
 */
export function nombreSegunIdioma(idioma: Idioma, nombre: string, nombreEn: string | null | undefined): string {
  if (idioma === 'en' && nombreEn && nombreEn.trim()) return nombreEn;
  return nombre;
}
