import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import type { Motivo, MotivoAusencia } from '@/lib/types';

/**
 * Catálogos casi-estáticos (motivos de incidencia y de ausencia) que se
 * leen en la página de mayor tráfico de toda la app (/rider/dashboard,
 * cargada por cientos de riders al día) pero que en la práctica casi
 * nunca cambian — confirmado con el usuario: un solo motivo desactivado
 * en 2 meses de uso real. Cachearlos ahorra 2 consultas por cada carga
 * del dashboard de rider.
 *
 * Usa el cliente de servicio (no el de sesión/cookies) porque
 * unstable_cache() no admite depender de cookies()/headers() — y de
 * todas formas el resultado es el MISMO para cualquier rider o admin,
 * no hay nada que filtrar por usuario aquí.
 *
 * Invalidación: cada acción de Configuración que edita motivos
 * (toggleMotivo, actualizarInstruccionesMotivo(En), actualizarNombreMotivoEn,
 * toggleMotivoAusencia, actualizarNombreMotivoAusenciaEn) llama a
 * revalidateTag('motivos' | 'motivos-ausencia') justo después de guardar,
 * así que un cambio se refleja al instante — el `revalidate: 3600` de
 * abajo es solo una red de seguridad, no el mecanismo real.
 */
export const obtenerMotivosActivos = unstable_cache(
  async (): Promise<Motivo[]> => {
    const admin = createAdminClient();
    const { data } = await admin.from('motivos').select('*').eq('activo', true).order('nombre');
    return (data ?? []) as Motivo[];
  },
  ['motivos-activos'],
  { tags: ['motivos'], revalidate: 3600 }
);

export const obtenerMotivosAusenciaActivos = unstable_cache(
  async (): Promise<MotivoAusencia[]> => {
    const admin = createAdminClient();
    const { data } = await admin.from('motivos_ausencia').select('*').eq('activo', true).order('nombre');
    return (data ?? []) as MotivoAusencia[];
  },
  ['motivos-ausencia-activos'],
  { tags: ['motivos-ausencia'], revalidate: 3600 }
);
