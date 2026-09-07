import type { Metadata, Viewport } from 'next';
import './globals.css';
import './creation.css';
import './modules.css';

export const metadata: Metadata = {
  title: 'Nexus Realms: Telegram Legends',
  description: 'Dark fantasy mobile RPG inside Telegram',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#09070d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
