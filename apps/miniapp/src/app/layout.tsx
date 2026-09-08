import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import './creation.css';
import './modules.css';
import './extras.css';
import './systems.css';
import './admin.css';
import './premium-theme.css';
import './premium-home.css';
import './progression.css';
import './crafting-premium.css';
import './portrait-art.css';
import './realm-art.css';
import './aaa-polish.css';
import './endgame.css';
import './inventory-premium.css';
import './settings.css';
import './liveops.css';
import './combat-premium.css';

export const metadata: Metadata = {
  title: 'Nexus Realms: Telegram Legends',
  description: 'Dark fantasy mobile RPG inside Telegram',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07060a',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
