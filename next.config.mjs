/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Evita que el panel se cargue dentro de un <iframe> de otro sitio (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita que el navegador intente adivinar el tipo de contenido
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No enviamos la URL completa como referrer a sitios externos
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Desactiva APIs sensibles del navegador que este panel no necesita
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
