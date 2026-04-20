import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EarthGND — Professionele Aardingsberekeningen',
  description: 'Bereken nauwkeurig de aardingsweerstand op basis van BRO bodemdata.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
