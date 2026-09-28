/** @type {import('next').NextConfig} */
const securityHeaders = [
  // La cabecera de iframe (X-Frame-Options / frame-ancestors) NO está aquí:
  // la pone el middleware, que lee FRAME_ANCESTORS en cada petición en vez
  // de al compilar. Ver aplicarCabeceraIframe() en middleware.ts.
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
