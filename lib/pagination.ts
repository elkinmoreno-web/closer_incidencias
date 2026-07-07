/**
 * Genera la lista de números de página a mostrar, con "..." para los
 * huecos, en vez de listar las 400+ páginas que puede tener una tabla
 * grande. Ej: 1 ... 8 9 [10] 11 12 ... 412
 */
export function paginasAMostrar(actual: number, total: number): (number | 'gap')[] {
  if (total <= 9) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const paginas = new Set<number>();
  paginas.add(1);
  paginas.add(2);
  paginas.add(total);
  paginas.add(total - 1);
  for (let p = actual - 1; p <= actual + 1; p++) {
    if (p >= 1 && p <= total) paginas.add(p);
  }

  const ordenadas = Array.from(paginas).sort((a, b) => a - b);
  const resultado: (number | 'gap')[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    if (i > 0 && ordenadas[i] - ordenadas[i - 1] > 1) resultado.push('gap');
    resultado.push(ordenadas[i]);
  }
  return resultado;
}
