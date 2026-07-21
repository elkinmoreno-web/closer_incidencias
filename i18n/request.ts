import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const LOCALE_COOKIE = 'idioma';
export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

/** Idioma preferido del navegador (cabecera Accept-Language), si coincide con uno soportado. */
function localeDelNavegador(): Locale | null {
  const aceptado = headers().get('accept-language');
  if (!aceptado) return null;
  const preferido = aceptado.split(',')[0]?.split('-')[0]?.toLowerCase();
  return LOCALES.includes(preferido as Locale) ? (preferido as Locale) : null;
}

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value as Locale | undefined;
  const locale = (cookieLocale && LOCALES.includes(cookieLocale) ? cookieLocale : localeDelNavegador()) ?? DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
