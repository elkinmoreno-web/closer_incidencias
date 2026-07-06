import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Closer Logistics — Panel',
  description: 'Panel interno de gestión de incidencias y ausencias de riders',
  robots: { index: false, follow: false }, // Panel interno: fuera de buscadores
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
