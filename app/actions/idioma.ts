'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/request';

export async function cambiarIdioma(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' });
}
