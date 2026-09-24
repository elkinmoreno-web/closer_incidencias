import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient, getAdminActual, getRiderActual } from '@/lib/supabase/server';

/**
 * Visibilidad de módulos: interruptores que permiten encender y apagar
 * partes del panel sin desplegar.
 *
 * Tres estados por módulo:
 *   · todos          — visible para todo el mundo
 *   · nadie          — apagado
 *   · seleccionados  — solo para los admins elegidos (módulos del panel
 *                      de gestión) o los centros elegidos (pestañas del
 *                      panel del rider)
 *
 * IMPORTANTE: esconder la entrada del menú NO es seguridad. Cualquiera
 * con la URL entraría igual, así que la comprobación se repite en el
 * servidor con `exigirModuloAdmin()` en la propia página, y en las
 * server actions del rider. El menú solo evita enseñar lo que no toca.
 */

export type VisibilidadModulo = 'todos' | 'nadie' | 'seleccionados';

export interface Modulo {
  clave: string;
  nombre: string;
  ambito: 'admin' | 'rider';
  ruta: string | null;
  visibilidad: VisibilidadModulo;
  orden: number;
}

/**
 * Claves de módulo visibles para el admin indicado.
 *
 * 'configuracion' nunca está en la tabla: si se pudiera apagar, el super
 * admin se quedaría sin la pantalla desde la que volver a encenderlo.
 */
export const modulosVisiblesAdmin = cache(async (adminId: string): Promise<Set<string>> => {
  const supabase = createClient();

  const [{ data: modulos }, { data: asignados }] = await Promise.all([
    supabase.from('modulos').select('clave, visibilidad').eq('ambito', 'admin'),
    supabase.from('modulo_admins').select('clave').eq('admin_id', adminId),
  ]);

  const mios = new Set((asignados ?? []).map((a) => a.clave as string));
  const visibles = new Set<string>();

  for (const m of modulos ?? []) {
    if (m.visibilidad === 'todos') visibles.add(m.clave);
    else if (m.visibilidad === 'seleccionados' && mios.has(m.clave)) visibles.add(m.clave);
  }
  return visibles;
});

/** Igual, pero para las pestañas del panel del rider (se eligen por centro). */
export const modulosVisiblesRider = cache(async (centroId: number | null): Promise<Set<string>> => {
  const supabase = createClient();

  const [{ data: modulos }, { data: porCentro }] = await Promise.all([
    supabase.from('modulos').select('clave, visibilidad').eq('ambito', 'rider'),
    centroId === null
      ? Promise.resolve({ data: [] as { clave: string }[] })
      : supabase.from('modulo_centros').select('clave').eq('centro_id', centroId),
  ]);

  const deMiCentro = new Set((porCentro ?? []).map((c) => c.clave as string));
  const visibles = new Set<string>();

  for (const m of modulos ?? []) {
    if (m.visibilidad === 'todos') visibles.add(m.clave);
    else if (m.visibilidad === 'seleccionados' && deMiCentro.has(m.clave)) visibles.add(m.clave);
  }
  return visibles;
});

/**
 * Corta el renderizado de una página del panel si su módulo está apagado
 * para quien la pide. Se llama al principio de la page.
 *
 * Sin esto, esconder la entrada del menú no serviría de nada: bastaría
 * con teclear la URL.
 */
export async function exigirModuloAdmin(clave: string): Promise<void> {
  const admin = await getAdminActual();
  if (!admin) redirect('/gestor/login');

  const visibles = await modulosVisiblesAdmin(admin.id);
  if (!visibles.has(clave)) redirect('/dashboard');
}

/**
 * Comprueba, desde una server action del PANEL, que el módulo está
 * encendido para quien la invoca.
 *
 * Hace falta ADEMÁS de `exigirModuloAdmin` en la página: Next ejecuta la
 * server action ANTES de renderizar el árbol, así que el guarda de la
 * page no llega a frenarla. Y los identificadores de las actions viajan
 * en el bundle del navegador, de modo que un gestor al que se le haya
 * apagado el módulo podría invocarla igualmente aunque no vea el menú
 * ni pueda abrir la pantalla.
 */
export async function moduloAdminActivo(clave: string): Promise<boolean> {
  const admin = await getAdminActual();
  if (!admin) return false;
  return (await modulosVisiblesAdmin(admin.id)).has(clave);
}

/**
 * Comprueba, desde una server action del rider, que el módulo está
 * encendido para su centro. Devuelve false para que la acción responda
 * con un error en vez de guardar algo que no debería existir.
 */
export async function moduloRiderActivo(clave: string): Promise<boolean> {
  const rider = await getRiderActual();
  if (!rider) return false;
  // getRiderActual no trae el centro, así que se pide aquí.
  const supabase = createClient();
  const { data } = await supabase.from('riders').select('centro_id').eq('id', rider.id).maybeSingle();
  const visibles = await modulosVisiblesRider(data?.centro_id ?? null);
  return visibles.has(clave);
}
