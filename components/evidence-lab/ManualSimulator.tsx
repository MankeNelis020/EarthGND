'use client';

import { useMemo, useState } from 'react';
import { manualBlendRho } from '@/lib/evidence-lab/bayesian-weights';

const PRESETS = [0, 10, 25, 50, 75, 100];

export function ManualSimulator({
  theoryRho,
  empiricalRho,
  label,
}: {
  theoryRho: number;
  empiricalRho: number | null;
  label: string;
}) {
  const [manual, setManual] = useState(false);
  const [w, setW] = useState(0);
  const emp = empiricalRho ?? theoryRho;

  const blended = useMemo(
    () => (manual ? manualBlendRho(theoryRho, emp, w / 100) : null),
    [manual, theoryRho, emp, w],
  );

  return (
    <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/80">
            Manual simulation — {label}
          </p>
          <p className="mt-1 text-xs text-white/45">Simulation only — does not affect production</p>
        </div>
        <button
          type="button"
          onClick={() => setManual(m => !m)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            manual ? 'bg-[#E8761A] text-white' : 'border border-white/15 text-white/70'
          }`}
        >
          {manual ? 'MANUAL' : 'AUTO'}
        </button>
      </div>

      {manual && (
        <div className="mt-4 space-y-3">
          <input
            type="range"
            min={0}
            max={100}
            value={w}
            onChange={e => setW(Number(e.target.value))}
            className="w-full accent-[#E8761A]"
            aria-label="Empirical weight percent"
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setW(p)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-mono ${
                  w === p ? 'bg-white/15 text-white' : 'text-white/40'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-white/35">Theory</p>
              <p className="font-condensed text-xl font-bold text-white">{theoryRho} Ω·m</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/35">Empirical</p>
              <p className="font-condensed text-xl font-bold text-white">{emp.toFixed(1)} Ω·m</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/35">Manual blend</p>
              <p className="font-condensed text-xl font-bold text-[#E8761A]">
                {blended?.toFixed(1)} Ω·m
              </p>
            </div>
          </div>
          <p className="font-mono text-[11px] text-white/35">
            ρ = {theoryRho}×(1−{w / 100}) + {emp.toFixed(1)}×{w / 100}
          </p>
        </div>
      )}
    </div>
  );
}
