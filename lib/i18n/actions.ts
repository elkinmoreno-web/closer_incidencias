'use server';

import { revalidatePath } from 'next/cache';
import { establecerIdiomaManual, type Idioma } from '@/lib/i18n/resolverIdioma';

/**
 * Cambia el idioma para esta sesión/navegador únicamente — no toca el
 * país real del rider/admin en la base de datos. Es una preferencia
 * puntual (ej. un super_admin de España revisando algo de la sede
 * alemana), no una configuración de cuenta.
 */
export async function cambiarIdiomaManual(idioma: Idioma) {
  await establecerIdiomaManual(idioma);
  revalidatePath('/', 'layout');
}
