import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'HackXperience by CIReN', template: '%s · HackXperience' },
  description:
    "Apply to CIReN hackathons and submit your project here. HackXperience is CIReN's hackathon platform.",
  metadataBase: new URL('https://hack.ciren.network'),
};

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
