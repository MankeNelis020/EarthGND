'use client';

/** Semi-circular instrument gauge — numeric value always visible. */

export function InstrumentGauge({
  label,
  value,
  unit = '%',
  min = 0,
  max = 100,
  subtext,
  tone = 'neutral',
}: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
  subtext?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';
}) {
  const v = value == null || !Number.isFinite(value) ? null : Math.min(max, Math.max(min, value));
  const pct = v == null ? 0 : (v - min) / (max - min || 1);
  const angle = -90 + pct * 180; // needle from left to right

  const toneClass =
    tone === 'ok'
      ? 'text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'danger'
          ? 'text-red-400'
          : tone === 'brand'
            ? 'text-[#E8761A]'
            : 'text-white';

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/8 bg-[#141414] px-4 py-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
      <div className="relative mt-3 h-[72px] w-[140px]">
        <svg viewBox="0 0 140 80" className="h-full w-full" aria-hidden>
          <path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none"
            stroke={tone === 'brand' ? '#E8761A' : tone === 'ok' ? '#34d399' : 'rgba(255,255,255,0.35)'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${pct * 188} 188`}
          />
          <line
            x1="70"
            y1="70"
            x2={70 + Math.cos((angle * Math.PI) / 180) * 48}
            y2={70 + Math.sin((angle * Math.PI) / 180) * 48}
            stroke="#E8761A"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="70" cy="70" r="3.5" fill="#E8761A" />
        </svg>
      </div>
      <p className={`font-condensed mt-1 text-3xl font-black tabular-nums ${toneClass}`}>
        {v == null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}`}
        <span className="ml-1 text-sm font-semibold text-white/40">{unit}</span>
      </p>
      {subtext && <p className="mt-1 max-w-[16rem] text-center text-[11px] leading-snug text-white/40">{subtext}</p>}
    </div>
  );
}

export function WeightBar({
  theoryPct,
  empiricalPct,
}: {
  theoryPct: number;
  empiricalPct: number;
}) {
  const t = Math.max(0, Math.min(100, theoryPct));
  const e = Math.max(0, Math.min(100, empiricalPct));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-white/45">
        <span>Theory {t.toFixed(0)}%</span>
        <span>Empirical {e.toFixed(0)}%</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
        <div className="h-full bg-white/35" style={{ width: `${t}%` }} />
        <div className="h-full bg-[#E8761A]" style={{ width: `${e}%` }} />
      </div>
    </div>
  );
}
