import type { Metadata } from 'next';
import './globals.css';
import { GTMLoader } from '@/components/analytics/GTMLoader';

export const metadata: Metadata = {
  title: 'EarthGND — Professionele Aardingsberekeningen',
  description: 'Bereken nauwkeurig de aardingsweerstand op basis van BRO bodemdata.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <GTMLoader />
        {children}
      </body>
    </html>
  );
}
