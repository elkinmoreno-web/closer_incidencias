'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CORREOS_GESTION_MODULOS } from '@/lib/utils';
import type { Modulo, VisibilidadModulo } from '@/lib/modulos';

/**
 * Quién puede tocar estos interruptores.
 *
 * Dos condiciones, las dos necesarias: ser super_admin Y estar en
 * CORREOS_GESTION_MODULOS. Ser super_admin no basta — hay 8 activos y
 * apagar un módulo afecta a todo el mundo.
 *
 * Esconder la sección en la interfaz NO es suficiente: cualquiera podría
 * invocar la server action directamente. Por eso se repite aquí, que es
 * donde de verdad se decide.
 */
async function exigirGestorDeModulos() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id, rol').eq('auth_user_id', user.id).single();
  if (!admin || admin.rol !== 'super_admin' || !user.email || !CORREOS_GESTION_MODULOS.includes(user.email)) {
    throw new Error('No tienes permiso para cambiar la visibilidad de los módulos');
  }
  return { supabase, adminId: admin.id as string };
}

export interface ModuloConSeleccion extends Modulo {
  /** Admins elegidos (ámbito admin) o centros elegidos (ámbito rider). */
  seleccion: string[];
}

/** Todos los módulos con su configuración, para pintar la pantalla. */
export async function listarModulos(): Promise<ModuloConSeleccion[]> {
  const { supabase } = await exigirGestorDeModulos();

  const [{ data: modulos }, { data: admins }, { data: centros }] = await Promise.all([
    supabase.from('modulos').select('*').order('orden'),
    supabase.from('modulo_admins').select('clave, admin_id'),
    supabase.from('modulo_centros').select('clave, centro_id'),
  ]);

  return (modulos ?? []).map((m) => ({
    ...(m as Modulo),
    seleccion:
      m.ambito === 'admin'
        ? (admins ?? []).filter((a) => a.clave === m.clave).map((a) => String(a.admin_id))
        : (centros ?? []).filter((c) => c.clave === m.clave).map((c) => String(c.centro_id)),
  }));
}

export type GuardarModuloState = { error: string } | { success: true } | undefined;

/**
 * Cambia la visibilidad de un módulo y, si es 'seleccionados', a quién.
 *
 * La lista se reescribe entera (borrar + insertar) en vez de calcular
 * diferencias: son unas pocas filas y así no queda nadie colgado de una
 * asignación vieja.
 */
export async function guardarModulo(
  clave: string,
  visibilidad: VisibilidadModulo,
  seleccion: string[]
): Promise<GuardarModuloState> {
  try {
    const { supabase, adminId } = await exigirGestorDeModulos();

    const { data: modulo } = await supabase.from('modulos').select('ambito, nombre').eq('clave', clave).maybeSingle();
    if (!modulo) return { error: 'Ese módulo no existe' };

    // 'seleccionados' sin nadie elegido equivale a apagarlo, pero de
    // forma confusa: se avisa en vez de dejarlo en un estado ambiguo.
    if (visibilidad === 'seleccionados' && seleccion.length === 0) {
      return { error: 'Elige al menos uno, o usa "Nadie" para apagarlo del todo.' };
    }

    const { error } = await supabase
      .from('modulos')
      .update({ visibilidad, actualizado_en: new Date().toISOString() })
      .eq('clave', clave);
    if (error) return { error: error.message };

    const tabla = modulo.ambito === 'admin' ? 'modulo_admins' : 'modulo_centros';
    const columna = modulo.ambito === 'admin' ? 'admin_id' : 'centro_id';

    await supabase.from(tabla).delete().eq('clave', clave);
    if (visibilidad === 'seleccionados' && seleccion.length > 0) {
      const filas = seleccion.map((id) => ({
        clave,
        [columna]: modulo.ambito === 'admin' ? id : Number(id),
      }));
      const { error: errorSel } = await supabase.from(tabla).insert(filas);
      if (errorSel) return { error: errorSel.message };
    }

    await supabase.from('auditoria').insert({
      admin_id: adminId,
      accion: 'Cambiar visibilidad de módulo',
      detalles: `${modulo.nombre}: ${visibilidad}${visibilidad === 'seleccionados' ? ` (${seleccion.length})` : ''}`,
      centro_id: null,
    });

    // Afecta al menú de todos y al panel del rider.
    revalidatePath('/dashboard', 'layout');
    revalidatePath('/rider/dashboard');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo guardar' };
  }
}
