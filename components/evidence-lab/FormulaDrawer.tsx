'use client';

import { useState } from 'react';
import type { FormulaEntry } from '@/lib/evidence-lab/formulas';

export function FormulaDrawer({ entry }: { entry: FormulaEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/8 py-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-semibold text-white">{entry.title}</span>
        <span className="text-[11px] uppercase tracking-wider text-[#E8761A]">
          {open ? 'Sluit' : 'Why?'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm text-white/60">
          <p className="font-mono text-[12px] text-amber-100/90">{entry.latexish}</p>
          <ul className="space-y-1 text-xs">
            {entry.symbols.map(s => (
              <li key={s.symbol}>
                <span className="font-mono text-white/80">{s.symbol}</span>
                {' — '}
                {s.meaning}
                {s.unit ? ` (${s.unit})` : ''}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-white/50">{entry.plainNl}</p>
        </div>
      )}
    </div>
  );
}
