/**
 * Orígenes que pueden empotrar el panel en un <iframe>, separados por
 * espacios (ej. "https://app.closerlogistics.com").
 *
 * Vacío (por defecto) = nadie: se mantiene X-Frame-Options: DENY, que es
 * como ha estado siempre. En cuanto se rellena, se sustituye por la
 * cabecera moderna Content-Security-Policy: frame-ancestors, que es la
 * única que admite una lista de permitidos — X-Frame-Options solo sabe
 * decir DENY o SAMEORIGIN, no "este sitio sí".
 *
 * Se deja fuera del código a propósito: cambiar quién puede empotrar el
 * panel no debería exigir un despliegue.
 */
const ancestrosPermitidos = (process.env.FRAME_ANCESTORS ?? '').trim();

/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Evita que el panel se cargue dentro de un <iframe> de otro sitio (clickjacking).
  // X-Frame-Options no entiende de listas, así que cuando hay orígenes
  // permitidos se quita y manda frame-ancestors.
  ...(ancestrosPermitidos
    ? [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${ancestrosPermitidos}` }]
    : [{ key: 'X-Frame-Options', value: 'DENY' }]),
  // Evita que el navegador intente adivinar el tipo de contenido
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No enviamos la URL completa como referrer a sitios externos
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Desactiva APIs sensibles del navegador que este panel no necesita
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Por defecto Next.js limita el cuerpo de una Server Action a 1MB.
    // La importación de riders y de métricas ya trocea el envío en el
    // cliente para no acercarse a ese límite, pero se sube el techo
    // como margen de seguridad adicional.
    serverActions: { bodySizeLimit: '5mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
