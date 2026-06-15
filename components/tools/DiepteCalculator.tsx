'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRhoEffective } from '@/lib/calculations';
import type { DiepteResult, LintResult, RiskClassResult, CorrosionClass } from '@/lib/calculations';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElectrodeType = 'pen' | 'lint';

interface PenScenarios  { gunstig: DiepteResult; gemiddeld: DiepteResult; ongunstig: DiepteResult }
interface LintScenarios { gunstig: LintResult;   gemiddeld: LintResult;   ongunstig: LintResult   }

interface ParallelAdvice {
  aantalPennen: number;
  minAfstand: number;
  rParallel: number;
  rSingle: number;
}

interface CalcResult {
  scenarios: PenScenarios | LintScenarios;
  electrodeType: ElectrodeType;
  riskClass: RiskClassResult;
  corrosionClass: CorrosionClass;
  parallelAdvice: ParallelAdvice | null;
  creditsRemaining: number;
  rhoDry?: number;
  rhoWet?: number;
  gwGunstig?: number;
  gwGemiddeld?: number;
  gwOngunstig?: number;
  gwSource?: 'peilbuis' | null;
}

interface Profile { plan: string; credits_left: number; credits_reset: string | null }

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESET_GROUPS = [
  {
    label: 'Met aardlek (TT)',
    items: [
      { label: '30 mA',  sublabel: '≤ 166 Ω', value: 166,    norm: 'NEN 1010' },
      { label: '100 mA', sublabel: '≤ 166 Ω', value: 166,    norm: 'NEN 1010' },
      { label: '300 mA', sublabel: '≤ 166 Ω', value: 166,    norm: 'NEN 1010' },
      { label: '500 mA', sublabel: '≤ 100 Ω', value: 100,    norm: 'NEN 1010' },
    ],
  },
  {
    label: 'Zonder aardlek (TT-automaat)',
    items: [
      { label: 'B10', sublabel: '≤ 1,00 Ω', value: 1.00,   norm: 'NEN 1010' },
      { label: 'B16', sublabel: '≤ 0,63 Ω', value: 0.625,  norm: 'NEN 1010' },
      { label: 'B25', sublabel: '≤ 0,40 Ω', value: 0.40,   norm: 'NEN 1010' },
      { label: 'C16', sublabel: '≤ 0,31 Ω', value: 0.3125, norm: 'NEN 1010' },
      { label: 'C20', sublabel: '≤ 0,25 Ω', value: 0.25,   norm: 'NEN 1010' },
    ],
  },
  {
    label: 'Overig',
    items: [
      { label: 'Bliksem',   sublabel: '≤ 10 Ω', value: 10, norm: 'NEN 62305' },
      { label: 'Utiliteit', sublabel: '≤ 5 Ω',  value: 5,  norm: 'NEN 50522' },
    ],
  },
] as const;

const ZONDER_AARDLEK_VALUES = new Set([1.00, 0.625, 0.40, 0.3125, 0.25]);

// ─── Ra haalbaarheidscheck limits ─────────────────────────────────────────────

const RA_CHECK = [
  { label: 'Aardlek 30–300 mA (TT)',         max: 166,    group: 'rcd'     as const },
  { label: 'Aardlek 500 mA (TT)',             max: 100,    group: 'rcd'     as const },
  { label: 'Bliksem NEN 62305',               max: 10,     group: 'special' as const },
  { label: 'B10 — TT, geen aardlek',          max: 1.00,   group: 'breaker' as const },
  { label: 'B16 — TT, geen aardlek',          max: 0.625,  group: 'breaker' as const },
  { label: 'B25 — TT, geen aardlek',          max: 0.40,   group: 'breaker' as const },
  { label: 'C16 — TT, geen aardlek',          max: 0.3125, group: 'breaker' as const },
  { label: 'C20 — TT, geen aardlek',          max: 0.25,   group: 'breaker' as const },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v < 1) return v.toFixed(3);
  if (v < 10) return v.toFixed(2);
  return v.toFixed(1);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">{children}</p>;
}

// ─── Soil Cross-Section Visualization ────────────────────────────────────────

function SoilCrossSection({
  rodLength,
  gwDepth,
  numRods,
  spacing,
}: {
  rodLength: number;
  gwDepth: number;
  numRods: number;
  spacing: number;
}) {
  const maxDepth = Math.max(rodLength * 1.25, gwDepth + 1, 4);
  const W = 280;
  const H = 180;
  const ml = 30; // margin left (for depth labels)
  const mt = 18; // margin top (for "maaiveld" label)
  const mr = 60; // margin right (for GHG label)
  const mb = 8;
  const dw = W - ml - mr;
  const dh = H - mt - mb;

  const toY = (d: number) => mt + (d / maxDepth) * dh;
  const gwY  = toY(Math.min(gwDepth, maxDepth));
  const rodY = toY(Math.min(rodLength, maxDepth));

  // Evenly distribute rods within the draw area
  const rodXs = Array.from({ length: numRods }, (_, i) =>
    ml + ((i + 1) * dw) / (numRods + 1),
  );

  // Depth tick marks
  const ticks = [0, 2, 4, 6, 8, 10, 12].filter(d => d <= maxDepth);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-xl overflow-hidden"
      style={{ maxHeight: 200 }}
    >
      {/* Dry zone */}
      <rect x={ml} y={mt} width={dw} height={gwY - mt} fill="#78491A" fillOpacity={0.45} />
      {/* Wet zone */}
      <rect x={ml} y={gwY} width={dw} height={H - mb - gwY} fill="#1A3A5C" fillOpacity={0.5} />
      {/* Outer border */}
      <rect x={ml} y={mt} width={dw} height={dh} fill="none" stroke="#ffffff18" strokeWidth={1} />

      {/* GHG dashed line */}
      <line x1={ml} y1={gwY} x2={ml + dw} y2={gwY} stroke="#60A5FA" strokeWidth={1.5} strokeDasharray="6,4" />
      {/* GHG label */}
      <text x={ml + dw + 5} y={gwY + 4} fill="#60A5FA" fontSize={9} fontFamily="monospace">
        GHG {gwDepth.toFixed(1)}m
      </text>

      {/* Earth rods */}
      {rodXs.map((x, i) => (
        <g key={i}>
          {/* Rod line */}
          <line x1={x} y1={mt} x2={x} y2={rodY} stroke="#F97316" strokeWidth={2.5} strokeLinecap="round" />
          {/* Rod tip triangle */}
          <polygon
            points={`${x - 3},${rodY} ${x + 3},${rodY} ${x},${rodY + 5}`}
            fill="#F97316"
          />
          {/* Spacing label between rods */}
          {i < rodXs.length - 1 && (
            <text
              x={(x + rodXs[i + 1]) / 2}
              y={mt + 12}
              textAnchor="middle"
              fill="#F9731660"
              fontSize={7}
            >
              {spacing}m
            </text>
          )}
        </g>
      ))}

      {/* Maaiveld label */}
      <text x={ml + 4} y={mt - 5} fill="#9CA3AF" fontSize={9}>maaiveld</text>

      {/* Depth labels */}
      {ticks.map(d => (
        <g key={d}>
          <line x1={ml - 4} y1={toY(d)} x2={ml} y2={toY(d)} stroke="#ffffff30" strokeWidth={1} />
          <text x={ml - 6} y={toY(d) + 3} textAnchor="end" fill="#6B7280" fontSize={8}>
            {d}m
          </text>
        </g>
      ))}

      {/* Zone labels */}
      {gwDepth > 1 && (
        <text x={ml + dw - 4} y={mt + (gwY - mt) / 2 + 4} textAnchor="end" fill="#A16207" fontSize={8} fontStyle="italic">
          droog
        </text>
      )}
      {gwDepth < maxDepth - 0.5 && (
        <text x={ml + dw - 4} y={gwY + (H - mb - gwY) / 2 + 4} textAnchor="end" fill="#3B82F6" fontSize={8} fontStyle="italic">
          verzadigd
        </text>
      )}
    </svg>
  );
}

// ─── Resistance vs Depth Graph ────────────────────────────────────────────────

function RvsDiepteGraph({
  rhoDry,
  rhoWet,
  gwDepth,
  targetResistance,
  achievedDepth,
}: {
  rhoDry: number;
  rhoWet: number;
  gwDepth: number;
  targetResistance: number;
  achievedDepth: number;
}) {
  const maxDepth = Math.max(achievedDepth * 1.3, 6);
  const d = 0.014;

  const points = useMemo(() => {
    const pts: { depth: number; R: number }[] = [];
    for (let L = 0.5; L <= maxDepth + 0.01; L += 0.25) {
      const rhoEff = calcRhoEffective(rhoDry, rhoWet, gwDepth, L);
      const R = (rhoEff / (2 * Math.PI * L)) * Math.log((4 * L) / d);
      pts.push({ depth: L, R: Math.round(R * 100) / 100 });
    }
    return pts;
  }, [rhoDry, rhoWet, gwDepth, maxDepth]);

  const maxR = Math.min(points[0]?.R ?? 500, 500);
  const W = 300;
  const H = 160;
  const ml = 44;
  const mt = 10;
  const mr = 10;
  const mb = 28;
  const dw = W - ml - mr;
  const dh = H - mt - mb;

  const toX = (depth: number) => ml + (depth / maxDepth) * dw;
  const toY = (R: number)     => mt + (1 - Math.min(R, maxR) / maxR) * dh;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.depth).toFixed(1)},${toY(p.R).toFixed(1)}`)
    .join(' ');

  const targetY = toY(targetResistance);
  const achievedX = toX(achievedDepth);

  // Y axis ticks
  const rMax = Math.ceil(maxR / 50) * 50;
  const yTicks = [0, rMax / 4, rMax / 2, (3 * rMax) / 4, rMax].map(v => Math.round(v));
  // X axis ticks
  const xStep = maxDepth <= 6 ? 1 : maxDepth <= 12 ? 2 : 3;
  const xTicks = Array.from({ length: Math.floor(maxDepth / xStep) + 1 }, (_, i) => i * xStep);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 170 }}>
        {/* Grid lines */}
        {yTicks.map(v => (
          <line key={v} x1={ml} y1={toY(v)} x2={ml + dw} y2={toY(v)}
            stroke="#ffffff0a" strokeWidth={1} />
        ))}

        {/* Resistance curve */}
        <path d={pathD} fill="none" stroke="#F97316" strokeWidth={2} strokeLinecap="round" />

        {/* Target resistance line */}
        <line x1={ml} y1={targetY} x2={ml + dw} y2={targetY}
          stroke="#ffffff40" strokeWidth={1} strokeDasharray="5,4" />
        <text x={ml + dw - 2} y={targetY - 3} textAnchor="end" fill="#ffffff50" fontSize={8}>
          doel {targetResistance} Ω
        </text>

        {/* Achieved depth marker */}
        <line x1={achievedX} y1={mt} x2={achievedX} y2={mt + dh}
          stroke="#F9731640" strokeWidth={1} strokeDasharray="4,3" />
        <circle cx={achievedX} cy={toY(targetResistance)} r={3.5} fill="#F97316" />
        <text x={achievedX + 5} y={toY(targetResistance) - 5} fill="#F97316" fontSize={8}>
          {achievedDepth.toFixed(2)}m
        </text>
        <text x={achievedX + 5} y={toY(targetResistance) + 8} fill="#F97316" fontSize={8}>
          {targetResistance.toFixed(1)} Ω
        </text>

        {/* Y axis */}
        <line x1={ml} y1={mt} x2={ml} y2={mt + dh} stroke="#ffffff20" strokeWidth={1} />
        {yTicks.map(v => (
          <g key={v}>
            <line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke="#ffffff30" strokeWidth={1} />
            <text x={ml - 5} y={toY(v) + 3} textAnchor="end" fill="#6B7280" fontSize={7}>
              {v}
            </text>
          </g>
        ))}
        <text
          x={10} y={mt + dh / 2} textAnchor="middle" fill="#6B7280" fontSize={8}
          transform={`rotate(-90, 10, ${mt + dh / 2})`}
        >
          R (Ω)
        </text>

        {/* X axis */}
        <line x1={ml} y1={mt + dh} x2={ml + dw} y2={mt + dh} stroke="#ffffff20" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={mt + dh} x2={toX(v)} y2={mt + dh + 3} stroke="#ffffff30" strokeWidth={1} />
            <text x={toX(v)} y={mt + dh + 12} textAnchor="middle" fill="#6B7280" fontSize={7}>
              {v}m
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-white/25 leading-relaxed">
        Weerstand van één pen vs. diepte. Blijft de curve boven de doellijn, dan haalt één pen het doel
        niet — vandaar parallelle pennen of een alternatief.
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoginGate() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <svg className="h-5 w-5 text-white/40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 10h-1V7A5 5 0 0 0 7 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v3z"/>
        </svg>
      </div>
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Inloggen vereist</h3>
      <p className="mb-5 text-sm text-white/50">De Pendiepte Calculator is beschikbaar voor abonnees.</p>
      <div className="flex flex-col items-center gap-2">
        <Link href="/login" className="rounded-lg bg-[#E8761A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors">
          Inloggen of registreren
        </Link>
        <Link href="/pricing" className="text-xs text-white/40 hover:text-white/70 transition-colors">Bekijk tarieven</Link>
      </div>
    </div>
  );
}

function CreditsGate({ plan }: { plan: string }) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-8 text-center">
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Geen credits</h3>
      <p className="mb-5 text-sm text-white/50">
        {plan === 'gratis' ? 'De Pendiepte Calculator vereist een abonnement of losse credits.' : 'Je credits zijn op.'}
      </p>
      <Link href="/pricing" className="rounded-lg bg-[#E8761A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors">
        {plan === 'gratis' ? 'Bekijk tarieven' : 'Credits bijkopen'}
      </Link>
    </div>
  );
}

function ScenarioCard({ label, sublabel, dimension, dimensionUnit, resistance, dimmed }: {
  label: string; sublabel: string; dimension: number; dimensionUnit: string; resistance: number; dimmed?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-opacity ${dimmed ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
      <p className="mb-0.5 text-xs font-semibold text-white/60">{label}</p>
      <p className="mb-3 text-[11px] text-white/30">{sublabel}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-condensed text-3xl font-black text-white">{dimension.toFixed(2)}</span>
        <span className="text-sm text-white/40">{dimensionUnit}</span>
      </div>
      <div className="text-xs text-white/40">{resistance.toFixed(2)} Ω berekend</div>
    </div>
  );
}

function RaHaalbaarheidsCheck({ raGemiddeld, raOngunstig }: { raGemiddeld: number; raOngunstig: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Ra-haalbaarheidscheck</p>
        <p className="mt-0.5 text-xs text-white/30">
          Welke beveiligingen zijn haalbaar met Ra ≈ {fmt(raOngunstig)} Ω (ongunstig scenario)?
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {RA_CHECK.map(({ label, max, group }) => {
          const passWorst = raOngunstig <= max;
          const passAvg   = raGemiddeld <= max;
          const status = passWorst ? 'pass' : passAvg ? 'conditional' : 'fail';
          return (
            <div key={label} className={`flex items-center gap-3 px-5 py-2.5 ${
              status === 'pass'        ? 'bg-green-500/3' :
              status === 'conditional' ? 'bg-yellow-500/3' :
                                         'bg-red-500/3'
            }`}>
              <span className={`shrink-0 text-sm font-bold ${
                status === 'pass' ? 'text-green-400' : status === 'conditional' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {status === 'pass' ? '✓' : status === 'conditional' ? '⚠' : '✗'}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-white/70">{label}</span>
                {status === 'conditional' && (
                  <span className="ml-2 text-[10px] text-yellow-400/70">haalbaar gemiddeld, niet ongunstig</span>
                )}
              </div>
              <span className={`shrink-0 font-mono text-xs ${
                group === 'breaker' ? 'text-orange-400/70' : 'text-white/30'
              }`}>
                ≤ {fmt(max)} Ω
              </span>
            </div>
          );
        })}
      </div>
      {raOngunstig > 0.625 && (
        <div className="border-t border-white/6 px-5 py-3 text-[10px] text-white/30">
          TT zonder aardlek vereist Ra &lt; 1 Ω — in de meeste Nederlandse grond niet haalbaar met één verticale pen.
          Overweeg een aardlekschakelaar (30 mA → max 166 Ω).
        </div>
      )}
    </div>
  );
}

function CorrosieKaart({ cc }: { cc: CorrosionClass }) {
  const colors = {
    green:  { border: 'border-green-500/20',  bg: 'bg-green-500/5',  text: 'text-green-400'  },
    yellow: { border: 'border-yellow-500/20', bg: 'bg-yellow-500/5', text: 'text-yellow-400' },
    orange: { border: 'border-orange-500/20', bg: 'bg-orange-500/5', text: 'text-orange-400' },
    red:    { border: 'border-red-500/20',    bg: 'bg-red-500/5',    text: 'text-red-400'    },
  }[cc.color];

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
          Corrosieclassificatie — {cc.label}
        </p>
        <span className="ml-auto text-[10px] text-white/30">{cc.lifetimeYears}</span>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">{cc.advies}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DiepteCalculatorProps {
  initialTarget?: number;
  initialLabel?: string;
}

export function DiepteCalculator({ initialTarget, initialLabel }: DiepteCalculatorProps) {
  const { soilData, postcode } = useCalculator();

  const [user, setUser]       = useState<User | null | 'loading'>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [electrodeType, setElectrodeType] = useState<ElectrodeType>('pen');

  const [rho, setRho]                   = useState(125);
  const [targetResistance, setTarget]   = useState(initialTarget ?? 10);
  const [groundwaterDepth, setGw]       = useState(3);
  const [ph, setPh]                     = useState(6.5);

  const [lintBurialDepth, setLintDepth] = useState(0.8);
  const [lintDiameter, setLintDiam]     = useState(0.01);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('profiles').select('plan, credits_left, credits_reset').eq('id', data.user.id).single()
          .then(({ data: p }: { data: Profile | null }) => { if (p) setProfile(p); });
      }
    });
  }, []);

  useEffect(() => { if (soilData?.dominantRho) setRho(soilData.dominantRho); }, [soilData]);
  useEffect(() => { if (soilData?.groundwaterDepth != null) setGw(soilData.groundwaterDepth); }, [soilData]);

  if (user === 'loading') return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/3" />;
  if (!user) return <LoginGate />;
  if (profile && profile.credits_left <= 0) return <CreditsGate plan={profile.plan} />;

  const isZonderAardlek = ZONDER_AARDLEK_VALUES.has(targetResistance);
  const activeRho = soilData?.dominantRho ?? rho;
  // Extract lithoClass from BRO data for two-layer model
  const lithoClass = soilData?.samples?.[0]?.lithoClass ?? null;

  async function handleCalculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/diepte/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rho: activeRho,
          targetResistance,
          groundwaterDepth,
          ph,
          postcode: postcode || undefined,
          electrodeType,
          lithoClass: lithoClass ?? undefined,
          lintBurialDepth: electrodeType === 'lint' ? lintBurialDepth : undefined,
          lintConductorDiameter: electrodeType === 'lint' ? lintDiameter : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Berekening mislukt'); return; }
      setCalcResult(data);
      if (profile) setProfile(p => p ? { ...p, credits_left: data.creditsRemaining } : p);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  function scenarioDim(s: DiepteResult | LintResult): number {
    return ('depth' in s ? s.depth : s.length);
  }

  const riskColors: Record<string, string> = {
    green:  'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    red:    'border-red-500/30 bg-red-500/5',
  };
  const riskText: Record<string, string> = {
    green: 'text-green-400', yellow: 'text-yellow-400', orange: 'text-orange-400', red: 'text-red-400',
  };

  // Determine visualization params for result
  const gemiddeldResult = calcResult?.scenarios?.gemiddeld as DiepteResult | undefined;
  const rodLength  = gemiddeldResult?.depth ?? 0;
  const numRods    = calcResult?.parallelAdvice?.aantalPennen ?? 1;
  const rodSpacing = calcResult?.parallelAdvice?.minAfstand ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Soil / postcode lookup */}
      <PostcodeInput onRhoChange={setRho} onGroundwaterChange={d => d != null && setGw(d)} />

      {/* Credits */}
      {profile && (
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#E8761A]" />
          <span className="text-xs text-white/60">
            <strong className="text-white">{profile.credits_left} credits</strong> — {profile.plan} plan
          </span>
          <Link href="/pricing" className="ml-auto text-xs text-[#E8761A] hover:underline">Bijkopen</Link>
        </div>
      )}

      {/* Parameters */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">

        {/* Electrode type toggle */}
        <div className="mb-5">
          <SectionLabel>Elektrode type</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {(['pen', 'lint'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setElectrodeType(t); setCalcResult(null); }}
                className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                  electrodeType === t
                    ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                    : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                }`}
              >
                {t === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint'}
              </button>
            ))}
          </div>
          {electrodeType === 'lint' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-xs text-white/50">Ingraafdiepte</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="0.3" max="2" step="0.1" value={lintBurialDepth}
                    onChange={e => { setLintDepth(Number(e.target.value)); setCalcResult(null); }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                  <span className="text-xs text-white/40">m</span>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/50">Geleiderdiameter</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="0.006" max="0.025" step="0.001" value={lintDiameter}
                    onChange={e => { setLintDiam(Number(e.target.value)); setCalcResult(null); }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                  <span className="text-xs text-white/40">m</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Target resistance — grouped presets */}
        <div className="mb-5">
          <SectionLabel>Doelweerstand</SectionLabel>
          {initialTarget !== undefined && (
            <div className="mb-3 rounded-lg border border-[#E8761A]/30 bg-[#E8761A]/8 px-3 py-2 text-xs text-[#E8761A]">
              Vooringevuld vanuit Weerstand Calculator{initialLabel ? ` (${initialLabel})` : ''}: Ra ≤ {initialTarget} Ω
            </div>
          )}

          {PRESET_GROUPS.map(group => (
            <div key={group.label} className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/25">{group.label}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {group.items.map(p => (
                  <button
                    key={`${p.label}-${p.value}`}
                    onClick={() => { setTarget(p.value); setCalcResult(null); }}
                    className={`rounded-lg border px-2 py-2 text-left text-xs transition-all ${
                      targetResistance === p.value
                        ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                        : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                    }`}
                  >
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-[10px] text-white/30 mt-0.5">{p.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {isZonderAardlek && (
            <div className="mb-3 rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2.5 text-xs text-orange-300 leading-relaxed">
              <strong className="font-semibold">TT zonder aardlekschakelaar</strong> — automaat als enige beveiliging
              stelt zeer strenge eisen (&lt; 1 Ω). In de meeste Nederlandse grond is dit niet haalbaar
              met één verticale pen. De calculator toont de theoretisch benodigde diepte en alternatieven.
            </div>
          )}

          <div className="flex items-center gap-2 mt-1">
            <input
              type="number" min="0.1" step="0.1" value={targetResistance}
              onChange={e => { setTarget(Number(e.target.value)); setCalcResult(null); }}
              className="w-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
            <span className="text-sm text-white/40">Ω — handmatig</span>
          </div>
        </div>

        {/* ρ slider */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/50">
            Bodemweerstand ρ
            {soilData && <span className="ml-2 text-green-400">← BRO: {soilData.dominantRho} Ω·m</span>}
          </p>
          <div className="flex items-center gap-3">
            <input type="range" min="10" max="5000" step="10" value={activeRho}
              onChange={e => { setRho(Number(e.target.value)); setCalcResult(null); }}
              className="flex-1 accent-[#E8761A]" />
            <div className="flex items-center gap-1">
              <input type="number" min="1" value={activeRho}
                onChange={e => { setRho(Number(e.target.value)); setCalcResult(null); }}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
              <span className="text-xs text-white/40">Ω·m</span>
            </div>
          </div>
          {/* Two-layer indicator */}
          {lithoClass && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-white/30">
              <span className="inline-block h-2 w-3 rounded-sm bg-[#78491A]/70" />
              droog: {calcResult?.rhoDry ?? '—'} Ω·m
              <span className="inline-block h-2 w-3 rounded-sm bg-[#1A3A5C]/90" />
              verzadigd: {calcResult?.rhoWet ?? '—'} Ω·m
            </div>
          )}
        </div>

        {/* GW depth */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/50">
            GHG grondwaterstand
            {soilData?.groundwaterDepth != null && soilData.gwSource === 'peilbuis' && (
              <span className="ml-1 text-green-400" title="Afgeleid uit BRO-peilbuizen via NAP-correctie (maaiveld_NAP − filterdiepte_NAP)">← peilbuis ✓</span>
            )}
            {soilData?.groundwaterDepth != null && !soilData.gwSource && (
              <span className="ml-1 text-yellow-400" title="Grondwaterbron niet bepaald — controleer handmatig">← BRO (verifieer)</span>
            )}
            <span className="ml-1 text-white/25">(bepaalt droog/nat-zone in berekening)</span>
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="20" step="0.5" value={groundwaterDepth}
              onChange={e => { setGw(Number(e.target.value)); setCalcResult(null); }}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
            <span className="text-xs text-white/40">m onder maaiveld</span>
          </div>
          {soilData?.groundwaterDepth == null && (
            <p className="mt-1 text-[10px] text-yellow-500/60">
              Geen peilbuizen gevonden — controleer GHG via lokale bodemkaart of waterschap
            </p>
          )}
        </div>

        {/* pH */}
        <div>
          <p className="mb-2 text-xs text-white/50">
            Bodem pH
            <span className="ml-1 text-white/25">(corrosieclassificatie — geen invloed op pendiepte)</span>
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="14" step="0.1" value={ph}
              onChange={e => { setPh(Number(e.target.value)); setCalcResult(null); }}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
            <span className="text-xs text-white/40">pH</span>
          </div>
        </div>
      </div>

      {/* Calculate button */}
      <button
        onClick={handleCalculate}
        disabled={loading}
        className="rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white transition-opacity hover:bg-[#d06510] disabled:opacity-50"
      >
        {loading ? 'Berekening...' : `Bereken ${electrodeType === 'pen' ? 'pendiepte' : 'lintlengte'} — 1 credit`}
      </button>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      {/* Results */}
      {calcResult && (
        <div className="flex flex-col gap-3">

          {/* Soil cross-section + aanbevolen config */}
          {calcResult.electrodeType === 'pen' && rodLength > 0 && (
            <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
              <div className="border-b border-white/6 px-5 py-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  Aanbevolen configuratie
                </p>
                <p className="text-xs font-bold text-white">
                  {numRods > 1
                    ? `${numRods} pennen — elk ${rodLength.toFixed(2)} m, ${rodSpacing} m uit elkaar`
                    : `1 pen — ${rodLength.toFixed(2)} m diep`}
                </p>
              </div>
              <div className="px-5 py-4">
                <SoilCrossSection
                  rodLength={rodLength}
                  gwDepth={groundwaterDepth}
                  numRods={numRods}
                  spacing={rodSpacing}
                />
                {/* Two-layer legend */}
                {calcResult.rhoDry && calcResult.rhoWet && (
                  <div className="mt-2 flex items-center gap-4 text-[10px] text-white/40">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-sm bg-[#78491A]/70" />
                      Droge zone — ρ ≈ {calcResult.rhoDry} Ω·m
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-sm bg-[#1A3A5C]/90" />
                      Verzadigde zone — ρ ≈ {calcResult.rhoWet} Ω·m
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Three scenarios */}
          <div className="rounded-2xl border border-white/10 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
                Drie scenario&apos;s
              </span>
              <span className="text-xs text-white/30">
                GHG {groundwaterDepth}m · doel ≤ {targetResistance} Ω
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['gunstig', 'gemiddeld', 'ongunstig'] as const).map((key, i) => {
                const s = calcResult.scenarios[key] as DiepteResult | LintResult;
                const dim = scenarioDim(s);
                const unit = calcResult.electrodeType === 'lint' ? 'm lint' : 'm';
                const gwValues = [calcResult.gwGunstig, calcResult.gwGemiddeld, calcResult.gwOngunstig];
                const gwVal = gwValues[i];
                const sublabels = [
                  `GWT ${gwVal?.toFixed(1) ?? groundwaterDepth}m — natte periode`,
                  `GWT ${gwVal?.toFixed(1) ?? (groundwaterDepth + 1.5).toFixed(1)}m — gemiddeld`,
                  `GWT ${gwVal?.toFixed(1) ?? (groundwaterDepth + 3).toFixed(1)}m — droge zomer`,
                ];
                return (
                  <ScenarioCard
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    sublabel={sublabels[i]}
                    dimension={dim}
                    dimensionUnit={unit}
                    resistance={s.achievedResistance}
                    dimmed={key === 'ongunstig'}
                  />
                );
              })}
            </div>

            {/* Parallel rod advice */}
            {calcResult.parallelAdvice && (
              <div className="mt-4 rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
                <p className="mb-2 text-sm font-semibold text-orange-400">
                  Parallelschakeling aanbevolen — {calcResult.parallelAdvice.aantalPennen} pennen
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                  <div>
                    <span className="text-white/30">Diepte per pen</span>
                    <p className="font-semibold text-white">
                      {scenarioDim(calcResult.scenarios.gemiddeld as DiepteResult).toFixed(2)} m
                    </p>
                  </div>
                  <div>
                    <span className="text-white/30">Min. onderlinge afstand</span>
                    <p className="font-semibold text-white">{calcResult.parallelAdvice.minAfstand} m</p>
                  </div>
                  <div>
                    <span className="text-white/30">Ra enkelvoudig</span>
                    <p className="font-semibold text-white">{calcResult.parallelAdvice.rSingle} Ω</p>
                  </div>
                  <div>
                    <span className="text-white/30">Ra parallel (incl. koppeling)</span>
                    <p className="font-semibold text-[#E8761A]">{calcResult.parallelAdvice.rParallel} Ω</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Resistance vs depth graph (pen only, with two-layer data) */}
          {calcResult.electrodeType === 'pen' && calcResult.rhoDry && calcResult.rhoWet && (
            <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
                Weerstand vs. diepte (gemiddeld scenario)
              </p>
              <RvsDiepteGraph
                rhoDry={calcResult.rhoDry}
                rhoWet={calcResult.rhoWet}
                gwDepth={calcResult.gwGemiddeld ?? groundwaterDepth + 1.5}
                targetResistance={targetResistance}
                achievedDepth={scenarioDim(calcResult.scenarios.gemiddeld as DiepteResult)}
              />
            </div>
          )}

          {/* Ra-haalbaarheidscheck */}
          <RaHaalbaarheidsCheck
            raGemiddeld={(calcResult.scenarios.gemiddeld as DiepteResult | LintResult).achievedResistance}
            raOngunstig={(calcResult.scenarios.ongunstig as DiepteResult | LintResult).achievedResistance}
          />

          {/* Risk class */}
          <div className={`rounded-2xl border p-5 ${riskColors[calcResult.riskClass.color]}`}>
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${riskColors[calcResult.riskClass.color]}`}>
                <span className={`font-condensed text-2xl font-black ${riskText[calcResult.riskClass.color]}`}>
                  {calcResult.riskClass.riskClass}
                </span>
              </div>
              <div>
                <p className={`font-condensed text-lg font-bold ${riskText[calcResult.riskClass.color]}`}>
                  {calcResult.riskClass.label}
                </p>
                <p className="mt-1 text-sm text-white/60">{calcResult.riskClass.description}</p>
              </div>
            </div>
          </div>

          {/* Corrosion classification */}
          <CorrosieKaart cc={calcResult.corrosionClass} />

          {/* Disclaimer */}
          <p className="text-[11px] leading-relaxed text-white/25">
            Berekening met 2-laags bodemmodel (Dwight-formule): droge zone boven GHG (ρ ≈ {calcResult.rhoDry} Ω·m),
            verzadigde zone onder GHG (ρ ≈ {calcResult.rhoWet} Ω·m).
            De drie scenario&apos;s modelleren het grondwaterpeil in natte (GHG), gemiddelde (+1,5 m)
            en droge (+3,0 m) periode. Meet altijd ter plaatse na installatie conform NEN 3140.
          </p>
        </div>
      )}
    </div>
  );
}
