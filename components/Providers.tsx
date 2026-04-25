'use client';

import { CalculatorProvider } from '@/lib/context/CalculatorContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <CalculatorProvider>{children}</CalculatorProvider>;
}
