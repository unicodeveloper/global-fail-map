import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AuthInitializer } from '@/components/auth/auth-initializer';
import './globals.css';

const display = Space_Grotesk({ variable: '--font-display', subsets: ['latin'] });
const mono = IBM_Plex_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['400', '500', '600'] });
const editorial = Cormorant_Garamond({ variable: '--font-editorial', subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'] });
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://global-fail-map.vercel.app';
const description = 'An atlas of ambitious ideas that did not go to plan. Explore abandoned companies, cancelled megaprojects and experiments that changed what came next. Read the evidence. Build something better.';

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#101311',
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: 'Global Fail Map | The world is built on attempts', template: '%s | Global Fail Map' },
  description,
  applicationName: 'Global Fail Map',
  authors: [{ name: 'Valyu', url: 'https://valyu.ai' }],
  alternates: { canonical: '/' },
  openGraph: { title: 'Global Fail Map', description, siteName: 'Global Fail Map', type: 'website', url: baseUrl },
  twitter: { card: 'summary_large_image', title: 'Global Fail Map', description },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className={`${display.variable} ${mono.variable} ${editorial.variable}`}>
        <AuthInitializer>{children}</AuthInitializer>
        <Analytics />
      </body>
    </html>
  );
}
