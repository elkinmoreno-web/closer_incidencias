/**
 * Filtros de "Se paga en" y de regularización de Reclamaciones.
 *
 * Viven aquí y no en la página porque los usan la tabla Y la exportación a
 * Excel: si cada una los aplicara a su manera, el Excel no coincidiría con
 * lo que se ve en pantalla.
 *
 * `reg` vacío = sin regularizar: las regularizadas ya están pagadas y no
 * piden nada a nadie, así que salen del listado normal y solo se ven
 * eligiéndolas en el filtro.
 */
export type FiltroRegularizacion = '' | 'pendientes' | 'si' | 'todas';

// Genérico sobre el builder de Supabase: solo se usan .eq/.is/.not, y así
// sirve tanto para la consulta de la tabla como para la de exportar.
interface ConsultaFiltrable<T> {
  eq(columna: string, valor: unknown): T;
  is(columna: string, valor: null): T;
  not(columna: string, operador: string, valor: unknown): T;
}

export function aplicarFiltrosPago<T extends ConsultaFiltrable<T>>(query: T, via?: string, reg?: string): T {
  let q = query;
  if (via === 'primera_remesa' || via === 'siguiente_nomina') q = q.eq('via_pago', via);

  switch (reg as FiltroRegularizacion | undefined) {
    case 'todas':
      break;
    case 'si':
      q = q.not('regularizada_en', 'is', null);
      break;
    case 'pendientes':
      q = q.eq('estado', 'aprobada').is('regularizada_en', null);
      break;
    default:
      q = q.is('regularizada_en', null);
  }
  return q;
}
