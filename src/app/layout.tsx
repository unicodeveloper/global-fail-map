import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AuthInitializer } from '@/components/auth/auth-initializer';
import './globals.css';

const display = Geist({ variable: '--font-display', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-mono', subsets: ['latin'] });
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL || 'https://global-fail-map.vercel.app';
const description =
  'A graveyard of failed companies, cancelled projects and abandoned ideas. Search the world map to discover what happened, why it ended and the evidence behind the story.';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#22211f',
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Global Fail Map',
    template: '%s | Global Fail Map',
  },
  description,
  applicationName: 'Global Fail Map',
  authors: [{ name: 'Valyu', url: 'https://valyu.ai' }],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Global Fail Map',
    description,
    siteName: 'Global Fail Map',
    type: 'website',
    url: baseUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Global Fail Map',
    description,
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>
        <AuthInitializer>{children}</AuthInitializer>
        <Analytics />
      </body>
    </html>
  );
}
