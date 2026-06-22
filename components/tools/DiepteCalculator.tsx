'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/client';
import { EmailRapportButton } from './EmailRapportButton';
import type { DiepteRapportProps } from '@/components/pdf/DiepteRapportTemplate';
import type { User } from '@supabase/supabase-js';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRhoEffective } from '@/lib/calculations';
import type { DiepteResult, LintResult, RiskClassResult, CorrosionClass } from '@/lib/calculations';
import { calcAllMethods, DRIVE_METHOD_LABELS, ACTIVE_DRIVE_METHODS, type DriveMethod, type ZMaxBand, type RefusalLayer } from '@/lib/pipeline/driveability';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElectrodeType = 'pen' | 'lint';

interface PenScenarios  { gunstig: DiepteResult; gemiddeld: DiepteResult; ongunstig: DiepteResult }
interface LintScenarios { gunstig: LintResult;   gemiddeld: LintResult;   ongunstig: LintResult   }

interface ParallelAdvice {
  aantalPennen: number;
  minAfstand:   number;
  rParallel:    number;
  rSingle:      number;
  reason?:      'resistance' | 'driveability';
  zMax?:        ZMaxBand;
  refusalLayer?: RefusalLayer | null;
  targetUnreachable?: boolean;
}

interface CalcResult {
  scenarios: PenScenarios | LintScenarios;
  electrodeType: ElectrodeType;
  riskClass: RiskClassResult;
  corrosionClass: CorrosionClass;
  parallelAdvice: ParallelAdvice | null;
  creditsRemaining: number;
  calculationId?: string | null;
  rhoDry?: number;
  rhoWet?: number;
  gwGunstig?: number;
  gwGemiddeld?: number;
  gwOngunstig?: number;
  gwSource?: 'peilbuis' | null;
  driveability?: {
    method:       DriveMethod;
    zMax:         ZMaxBand;
    refusalLayer: RefusalLayer | null;
    isLimited:    boolean;
  };
  // Pipeline enrichment (present when pipeline is active)
  confidence?:        { level: 'hoog' | 'midden' | 'laag'; label: string; icon: string; showBROBadge: boolean };
  warnings?:          string[];
  uncertaintyBand?:   { typical: number; low: number; high: number; rhoFactorLow: number; rhoFactorHigh: number };
  plausibilityFlags?: { field: string; value: number | string; message: string; severity: 'light' | 'heavy' }[];
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
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/70">{children}</p>;
}

// ─── Soil Cross-Section Visualization ────────────────────────────────────────

function SoilCrossSection({
  rodLength,
  gwDepth,
  numRods,
  spacing,
  refusalDepth,
  refusalSoil,
}: {
  rodLength:     number;
  gwDepth:       number;
  numRods:       number;
  spacing:       number;
  refusalDepth?: number;
  refusalSoil?:  string;
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
        GHG {gwDepth.toFixed(2)}m
      </text>

      {/* Refusal / weigering line */}
      {refusalDepth != null && refusalDepth <= maxDepth && (() => {
        const refY = toY(refusalDepth);
        return (
          <g>
            <rect x={ml} y={refY} width={dw} height={H - mb - refY} fill="#ef4444" fillOpacity={0.08} />
            <line x1={ml} y1={refY} x2={ml + dw} y2={refY} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={ml + dw + 5} y={refY + 4} fill="#ef4444" fontSize={9} fontFamily="monospace">
              {refusalSoil ?? 'weigering'} {refusalDepth.toFixed(1)}m
            </text>
          </g>
        );
      })()}

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
      <p className="mt-1 text-[10px] text-white/60 leading-relaxed">
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
        <svg className="h-5 w-5 text-white/60" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 10h-1V7A5 5 0 0 0 7 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v3z"/>
        </svg>
      </div>
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Inloggen vereist</h3>
      <p className="mb-5 text-sm text-white/70">De Pendiepte Calculator is beschikbaar voor abonnees.</p>
      <div className="flex flex-col items-center gap-2">
        <Link href="/login" className="rounded-lg bg-[#E8761A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors">
          Inloggen of registreren
        </Link>
        <Link href="/pricing" className="text-xs text-white/60 hover:text-white/70 transition-colors">Bekijk tarieven</Link>
      </div>
    </div>
  );
}

function CreditsGate({ plan }: { plan: string }) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-8 text-center">
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Geen credits</h3>
      <p className="mb-5 text-sm text-white/70">
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
      <p className="mb-3 text-[11px] text-white/70">{sublabel}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-condensed text-3xl font-black text-white">{dimension.toFixed(2)}</span>
        <span className="text-sm text-white/60">{dimensionUnit}</span>
      </div>
      <div className="text-xs text-white/60">{resistance.toFixed(2)} Ω berekend</div>
    </div>
  );
}

function RaHaalbaarheidsCheck({ raGemiddeld, raOngunstig }: { raGemiddeld: number; raOngunstig: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Ra-haalbaarheidscheck</p>
        <p className="mt-0.5 text-xs text-white/70">
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
                group === 'breaker' ? 'text-orange-400/70' : 'text-white/70'
              }`}>
                ≤ {fmt(max)} Ω
              </span>
            </div>
          );
        })}
      </div>
      {raOngunstig > 0.625 && (
        <div className="border-t border-white/6 px-5 py-3 text-[10px] text-white/70">
          TT zonder aardlek vereist Ra &lt; 1 Ω — in de meeste Nederlandse grond niet haalbaar met één verticale pen.
          Overweeg een aardlekschakelaar (30 mA → max 166 Ω).
        </div>
      )}
    </div>
  );
}

function DriveabilityBlock({
  method,
  refusalLayer,
  isLimited,
  soilSamples,
  zReq,
}: {
  method:       DriveMethod;
  refusalLayer: RefusalLayer | null;
  isLimited:    boolean;
  soilSamples:  ReadonlyArray<{ depth: number; lithoClass: number }>;
  zReq:         number;
}) {
  const allMethods = calcAllMethods(soilSamples, zReq);
  const methods = Object.keys(DRIVE_METHOD_LABELS) as DriveMethod[];
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Drijfbaarheid &amp; weigering</p>
        <p className="mt-0.5 text-xs text-white/70">
          {isLimited
            ? refusalLayer
              ? `Weigering op ${refusalLayer.depth.toFixed(1)} m — ${refusalLayer.soil}`
              : `Methode-maximum van ${DRIVE_METHOD_LABELS[method]} begrenst diepte`
            : `Geen weigering — ${DRIVE_METHOD_LABELS[method]} haalt benodigde diepte`}
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {methods.map(m => {
          const d = allMethods[m];
          const active = m === method;
          return (
            <div key={m} className={`flex items-center gap-3 px-5 py-2.5 ${active ? 'bg-white/3' : ''}`}>
              <span className={`w-28 shrink-0 text-xs font-medium ${active ? 'text-white' : 'text-white/50'}`}>
                {DRIVE_METHOD_LABELS[m]}
              </span>
              <div className="flex flex-1 items-center gap-1">
                <span className={`font-mono text-xs ${d.isLimited ? 'text-orange-400' : 'text-green-400'}`}>
                  {d.zMax.typical.toFixed(1)} m
                </span>
                <span className="text-[10px] text-white/30">
                  ({d.zMax.low.toFixed(1)}–{d.zMax.high.toFixed(1)})
                </span>
              </div>
              {active && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  d.isLimited ? 'bg-orange-500/15 text-orange-400' : 'bg-green-500/15 text-green-400'
                }`}>
                  {d.isLimited ? 'begrensd' : 'haalbaar'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {refusalLayer && (
        <div className="border-t border-white/6 px-5 py-3 text-[10px] text-white/60 leading-relaxed">
          Grind op {refusalLayer.depth.toFixed(1)} m — GeoTOP/BRO bron.
          Weerstand van {refusalLayer.soil} is representatief voor de laag; actuele grenzen variëren.
          Voor pneumatisch is grind bereikbaar maar moeilijk; overweeg voorboren.
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
        <span className="ml-auto text-[10px] text-white/70">{cc.lifetimeYears}</span>
      </div>
      <p className="text-xs text-white/72 leading-relaxed">{cc.advies}</p>
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
  const [drijfmethode, setDrijfmethode]   = useState<DriveMethod>('sds');

  const [rho, setRho]                   = useState(125);
  const [targetResistance, setTarget]   = useState(initialTarget ?? 10);
  const [groundwaterDepth, setGw]       = useState(3);
  const [ph, setPh]                     = useState(6.5);

  const [lintBurialDepth, setLintDepth] = useState(0.8);
  const [lintDiameter, setLintDiam]     = useState(0.01);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [confirmationMsg, setConfirmationMsg] = useState<string | null>(null);

  // Monteur invite state
  const [monteurEmail, setMonteurEmail]     = useState('');
  const [monteurSending, setMonteurSending] = useState(false);
  const [monteurSent, setMonteurSent]       = useState(false);
  const [monteurError, setMonteurError]     = useState('');
  const [showMonteurModal, setShowMonteurModal] = useState(false);
  const [uuidCopied, setUuidCopied]         = useState(false);

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

  // Profile is fetched async after auth — treat null (still loading) as non-pro
  // to avoid showing pro UI before we know the plan. plan 'gratis' is the free tier.
  const isPro = profile !== null && profile.plan !== 'gratis';

  const isZonderAardlek = ZONDER_AARDLEK_VALUES.has(targetResistance);
  const activeRho = soilData?.dominantRho ?? rho;

  // ─── Step 1: ρ-koppeling fix ──────────────────────────────────────────────
  // lithoClass for the legacy legend trigger (kept as-is to avoid UI regressions).
  const lithoClass = soilData?.samples?.[0]?.lithoClass ?? null;
  // Dry-zone ρ: average actual rho of BRO samples shallower than GHG.
  // When no samples are above GHG, fall back to null (API uses ratio fallback).
  const samplesAboveGhg = (soilData?.samples ?? []).filter(s => Math.abs(s.depth) < groundwaterDepth);
  const rhoDryProfile = samplesAboveGhg.length > 0
    ? Math.round(samplesAboveGhg.reduce((sum, s) => sum + s.rho, 0) / samplesAboveGhg.length)
    : null;
  const hasBroProfile = soilData != null;

  async function handleCalculate(confirmed = false) {
    setLoading(true);
    setError('');
    setConfirmationMsg(null);
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
          rhoDryOverride: rhoDryProfile ?? undefined,
          hasBroProfile: hasBroProfile || undefined,
          lintBurialDepth: electrodeType === 'lint' ? lintBurialDepth : undefined,
          lintConductorDiameter: electrodeType === 'lint' ? lintDiameter : undefined,
          // Driveability
          drijfmethode: electrodeType === 'pen' ? drijfmethode : undefined,
          soilSamples:  soilData?.samples?.map(s => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })) ?? [],
          // Source metadata for pipeline confidence scoring
          dataSource:   soilData?.dataSource,
          boringAfstand: soilData?.boringAfstand,
          // Confirmation flag: user approved a heavy plausibility warning
          confirmed: confirmed || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 422 && data.confirmationRequired) {
        setConfirmationMsg(data.error?.message ?? 'Bevestig de invoerwaarden voordat de berekening start.');
        return;
      }
      if (!res.ok) { setError(data.error ?? 'Berekening mislukt'); return; }
      setCalcResult(data);
      if (profile) setProfile(p => p ? { ...p, credits_left: data.creditsRemaining } : p);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMonteur() {
    if (!calcResult?.calculationId) return;
    if (!monteurEmail || !monteurEmail.includes('@')) { setMonteurError('Voer een geldig e-mailadres in.'); return; }
    setMonteurSending(true);
    setMonteurError('');
    try {
      // Ensure draft record exists and rapport_naam is set before sending invite
      await fetch(`/api/calculations/${calcResult.calculationId}/draft`, { method: 'POST' });

      const res = await fetch(`/api/calculations/${calcResult.calculationId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monteurEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setMonteurError(data.error ?? 'Verzenden mislukt'); return; }
      setMonteurSent(true);
      setShowMonteurModal(false);
    } catch {
      setMonteurError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setMonteurSending(false);
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
  const dwightDepth = gemiddeldResult?.depth ?? 0;
  // When driveability limits, cap visual rod length at z_max.typical
  const isDriveabilityLimited = calcResult?.parallelAdvice?.reason === 'driveability';
  const rodLength  = isDriveabilityLimited
    ? (calcResult?.parallelAdvice?.zMax?.typical ?? dwightDepth)
    : dwightDepth;
  const numRods    = calcResult?.parallelAdvice?.aantalPennen ?? 1;
  const rodSpacing = calcResult?.parallelAdvice?.minAfstand ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Soil / postcode lookup */}
      <PostcodeInput onRhoChange={setRho} onGroundwaterChange={d => d != null && setGw(d)} isPro={isPro} />

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
          {electrodeType === 'pen' && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-white/70">Drijfmethode</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ACTIVE_DRIVE_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => { setDrijfmethode(m); setCalcResult(null); }}
                    className={`rounded-lg border px-2 py-2 text-left text-xs transition-all ${
                      drijfmethode === m
                        ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                        : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                    }`}
                  >
                    {DRIVE_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {electrodeType === 'lint' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-xs text-white/70">Ingraafdiepte</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="0.3" max="2" step="0.1" value={lintBurialDepth}
                    onChange={e => { setLintDepth(Number(e.target.value)); setCalcResult(null); }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                  <span className="text-xs text-white/60">m</span>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/70">Geleiderdiameter</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="0.006" max="0.025" step="0.001" value={lintDiameter}
                    onChange={e => { setLintDiam(Number(e.target.value)); setCalcResult(null); }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                  <span className="text-xs text-white/60">m</span>
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
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">{group.label}</p>
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
                    <span className="block text-[10px] text-white/70 mt-0.5">{p.sublabel}</span>
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
            <span className="text-sm text-white/60">Ω — handmatig</span>
          </div>
        </div>

        {/* ρ slider */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/70">
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
              <span className="text-xs text-white/60">Ω·m</span>
            </div>
          </div>
          {/* Two-layer indicator */}
          {lithoClass && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-white/70">
              <span className="inline-block h-2 w-3 rounded-sm bg-[#78491A]/70" />
              droog: {calcResult?.rhoDry ?? '—'} Ω·m
              <span className="inline-block h-2 w-3 rounded-sm bg-[#1A3A5C]/90" />
              verzadigd: {calcResult?.rhoWet ?? '—'} Ω·m
            </div>
          )}
        </div>

        {/* GW depth */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/70">
            GHG grondwaterstand
            {soilData?.groundwaterDepth != null && soilData.gwSource === 'peilbuis' && (
              <span className="ml-1 text-green-400" title="Afgeleid uit BRO-peilbuizen via NAP-correctie (maaiveld_NAP − filterdiepte_NAP)">← peilbuis ✓</span>
            )}
            {soilData?.groundwaterDepth != null && !soilData.gwSource && (
              <span className="ml-1 text-yellow-400" title="Grondwaterbron niet bepaald — controleer handmatig">← BRO (verifieer)</span>
            )}
            <span className="ml-1 text-white/60">(bepaalt droog/nat-zone in berekening)</span>
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="20" step="0.5" value={groundwaterDepth}
              onChange={e => { setGw(Number(e.target.value)); setCalcResult(null); }}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
            <span className="text-xs text-white/60">m onder maaiveld</span>
          </div>
          {soilData?.groundwaterDepth == null && (
            <p className="mt-1 text-[10px] text-yellow-500/60">
              Geen peilbuizen gevonden — controleer GHG via lokale bodemkaart of waterschap
            </p>
          )}
        </div>

        {/* pH */}
        <div>
          <p className="mb-2 text-xs text-white/70">
            Bodem pH
            <span className="ml-1 text-white/60">(corrosieclassificatie — geen invloed op pendiepte)</span>
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="14" step="0.1" value={ph}
              onChange={e => { setPh(Number(e.target.value)); setCalcResult(null); }}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
            <span className="text-xs text-white/60">pH</span>
          </div>
        </div>
      </div>

      {/* Confirmation banner (B-heavy plausibility warning) */}
      {confirmationMsg && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-3">
          <p className="text-sm text-yellow-300 leading-relaxed">{confirmationMsg}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirmationMsg(null)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white"
            >
              Annuleer
            </button>
            <button
              onClick={() => handleCalculate(true)}
              disabled={loading}
              className="rounded-lg border border-yellow-500/30 bg-yellow-500/15 px-3 py-1.5 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/25 disabled:opacity-50"
            >
              Bevestig &amp; bereken
            </button>
          </div>
        </div>
      )}

      {/* Calculate button */}
      <button
        onClick={() => handleCalculate()}
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
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                  Aanbevolen configuratie
                </p>
                <p className="text-xs font-bold text-white">
                  {numRods > 1 && isDriveabilityLimited
                    ? `${numRods} pennen × ${rodLength.toFixed(1)} m — ${calcResult.parallelAdvice?.refusalLayer?.soil ?? 'bodem'} begrenst diepte`
                    : numRods > 1
                    ? `${numRods} pennen — elk ${rodLength.toFixed(2)} m, ${rodSpacing} m uit elkaar`
                    : `1 pen — ${rodLength.toFixed(2)} m diep`}
                </p>
              </div>
              {isDriveabilityLimited && calcResult.parallelAdvice?.targetUnreachable && (
                <div className="border-b border-red-500/20 bg-red-500/5 px-5 py-2.5 text-xs text-red-300">
                  Doelweerstand niet haalbaar met verticale pennen in deze grond. Overweeg horizontaal lint of aardmat.
                </div>
              )}
              <div className="px-5 py-4">
                <SoilCrossSection
                  rodLength={rodLength}
                  gwDepth={groundwaterDepth}
                  numRods={numRods}
                  spacing={rodSpacing}
                  refusalDepth={
                    (calcResult.parallelAdvice?.refusalLayer?.warning === true ||
                     calcResult.parallelAdvice?.refusalLayer?.lithoClass === 6)
                      ? calcResult.parallelAdvice?.refusalLayer?.depth
                      : undefined
                  }
                  refusalSoil={
                    (calcResult.parallelAdvice?.refusalLayer?.warning === true ||
                     calcResult.parallelAdvice?.refusalLayer?.lithoClass === 6)
                      ? calcResult.parallelAdvice?.refusalLayer?.soil
                      : undefined
                  }
                />
                {/* Two-layer legend */}
                {calcResult.rhoDry && calcResult.rhoWet && (
                  <div className="mt-2 flex items-center gap-4 text-[10px] text-white/60">
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

          {/* Pipeline warnings (one source of truth when pipeline is active) */}
          {calcResult.warnings ? (
            calcResult.warnings.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                {calcResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-300 leading-relaxed">{w}</p>
                ))}
              </div>
            )
          ) : (
            /* Fallback: convergence warning for old API without pipeline enrichment */
            calcResult.electrodeType === 'pen' &&
            !(calcResult.scenarios.ongunstig as DiepteResult).converged && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-xs text-red-300 leading-relaxed">
                <strong className="font-semibold">Doelweerstand niet haalbaar</strong> — zelfs bij 100 m diepte wordt
                Ra ≤ {targetResistance} Ω niet bereikt in het ongunstige scenario.
                Overweeg een aardlekschakelaar (30 mA → max 166 Ω), aardmat, of meerdere pennen in een betere grondzone.
              </div>
            )
          )}

          {/* Three scenarios */}
          <div className="rounded-2xl border border-white/10 p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
                Drie scenario&apos;s
              </span>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-white/70">
                  GHG {groundwaterDepth}m · doel ≤ {targetResistance} Ω
                </span>
                {calcResult.confidence && (
                  <span className={`text-[10px] font-semibold ${
                    calcResult.confidence.level === 'hoog'   ? 'text-green-400' :
                    calcResult.confidence.level === 'midden' ? 'text-yellow-400' : 'text-orange-400'
                  }`}>
                    {calcResult.confidence.icon}{calcResult.confidence.showBROBadge ? ' BRO ✓' : ''} {calcResult.confidence.label}
                  </span>
                )}
              </div>
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

            {/* Uncertainty band (ρ-axis, orthogonal to GWT scenarios) */}
            {calcResult.uncertaintyBand && (
              <div className="mt-3 rounded-lg border border-white/6 bg-white/3 px-4 py-2.5 text-xs text-white/60">
                <span className="text-white/40">ρ-bandbreedte (gemiddeld scenario): </span>
                {calcResult.uncertaintyBand.low.toFixed(1)}–{calcResult.uncertaintyBand.high.toFixed(1)}{' '}
                {calcResult.electrodeType === 'lint' ? 'm lint' : 'm diep'}
                <span className="ml-1 text-white/40">
                  (ρ × {calcResult.uncertaintyBand.rhoFactorLow}–{calcResult.uncertaintyBand.rhoFactorHigh})
                </span>
              </div>
            )}

            {/* Parallel rod advice */}
            {calcResult.parallelAdvice && (
              <div className={`mt-4 rounded-xl border p-4 ${
                isDriveabilityLimited
                  ? 'border-red-500/25 bg-red-500/5'
                  : 'border-orange-500/25 bg-orange-500/5'
              }`}>
                <p className={`mb-2 text-sm font-semibold ${isDriveabilityLimited ? 'text-red-400' : 'text-orange-400'}`}>
                  {isDriveabilityLimited
                    ? `${calcResult.parallelAdvice.aantalPennen} pennen nodig — indrijfweerstand begrenst diepte`
                    : `Parallelschakeling aanbevolen — ${calcResult.parallelAdvice.aantalPennen} pennen`}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                  <div>
                    <span className="text-white/70">Diepte per pen</span>
                    <p className="font-semibold text-white">{rodLength.toFixed(1)} m</p>
                  </div>
                  <div>
                    <span className="text-white/70">Min. onderlinge afstand</span>
                    <p className="font-semibold text-white">{calcResult.parallelAdvice.minAfstand} m</p>
                  </div>
                  <div>
                    <span className="text-white/70">Ra enkelvoudig</span>
                    <p className="font-semibold text-white">{calcResult.parallelAdvice.rSingle} Ω</p>
                  </div>
                  <div>
                    <span className="text-white/70">Ra parallel (incl. koppeling)</span>
                    <p className="font-semibold text-[#E8761A]">{calcResult.parallelAdvice.rParallel} Ω</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Resistance vs depth graph (pen only, with two-layer data) */}
          {calcResult.electrodeType === 'pen' && calcResult.rhoDry && calcResult.rhoWet && (
            <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
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

          {/* Driveability block (pen only, when method is selected) */}
          {calcResult.electrodeType === 'pen' && calcResult.driveability && (
            <DriveabilityBlock
              method={calcResult.driveability.method}
              refusalLayer={calcResult.driveability.refusalLayer}
              isLimited={calcResult.driveability.isLimited}
              soilSamples={soilData?.samples?.map(s => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })) ?? []}
              zReq={dwightDepth}
            />
          )}

          {/* Ra-haalbaarheidscheck — uses combined Ra when driveability forces multiple rods */}
          <RaHaalbaarheidsCheck
            raGemiddeld={
              isDriveabilityLimited && calcResult.parallelAdvice?.rParallel != null
                ? calcResult.parallelAdvice.rParallel
                : (calcResult.scenarios.gemiddeld as DiepteResult | LintResult).achievedResistance
            }
            raOngunstig={
              isDriveabilityLimited && calcResult.parallelAdvice?.rParallel != null
                ? calcResult.parallelAdvice.rParallel
                : (calcResult.scenarios.ongunstig as DiepteResult | LintResult).achievedResistance
            }
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
          <p className="text-[11px] leading-relaxed text-white/60">
            Berekening met 2-laags bodemmodel (Dwight-formule): droge zone boven GHG (ρ ≈ {calcResult.rhoDry} Ω·m),
            verzadigde zone onder GHG (ρ ≈ {calcResult.rhoWet} Ω·m).
            De drie scenario&apos;s modelleren het grondwaterpeil in natte (GHG), gemiddelde (+1,5 m)
            en droge (+3,0 m) periode. Meet altijd ter plaatse na installatie conform NEN 3140.
          </p>

          {/* CTAs + UUID */}
          {calcResult.calculationId && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <EmailRapportButton
                  tool="diepte"
                  inputValues={{
                    ...(postcode ? { 'Postcode': postcode } : {}),
                    'Elektrodetype': calcResult.electrodeType === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint',
                    'Bodemweerstand ρ': `${activeRho} Ω·m`,
                    'Grondwaterstand (GHG)': `${groundwaterDepth} m`,
                    'pH bodem': ph,
                  }}
                  results={
                    calcResult.electrodeType === 'pen'
                      ? {
                          'Gunstig scenario (GHG)': `${((calcResult.scenarios as { gunstig: { depth: number } }).gunstig.depth).toFixed(2)} m`,
                          'Gemiddeld scenario': `${((calcResult.scenarios as { gemiddeld: { depth: number } }).gemiddeld.depth).toFixed(2)} m`,
                          'Ongunstig scenario (GLG)': `${((calcResult.scenarios as { ongunstig: { depth: number } }).ongunstig.depth).toFixed(2)} m`,
                          'Risicoklasse': calcResult.riskClass.label,
                          'Corrosieklasse': calcResult.corrosionClass.label,
                        }
                      : {
                          'Gunstig scenario (GHG)': `${((calcResult.scenarios as { gunstig: { length: number } }).gunstig.length).toFixed(1)} m`,
                          'Gemiddeld scenario': `${((calcResult.scenarios as { gemiddeld: { length: number } }).gemiddeld.length).toFixed(1)} m`,
                          'Ongunstig scenario (GLG)': `${((calcResult.scenarios as { ongunstig: { length: number } }).ongunstig.length).toFixed(1)} m`,
                          'Risicoklasse': calcResult.riskClass.label,
                          'Corrosieklasse': calcResult.corrosionClass.label,
                        }
                  }
                  diepteCalcResult={{
                    postcode: postcode || undefined,
                    electrodeType: calcResult.electrodeType,
                    rho: activeRho,
                    groundwaterDepth,
                    ph,
                    targetResistance,
                    rhoDry:      calcResult.rhoDry,
                    rhoWet:      calcResult.rhoWet,
                    gwGunstig:   calcResult.gwGunstig,
                    gwGemiddeld: calcResult.gwGemiddeld,
                    gwOngunstig: calcResult.gwOngunstig,
                    scenarios:   calcResult.scenarios as DiepteRapportProps['scenarios'],
                    parallelAdvice: calcResult.parallelAdvice,
                    riskClass:      calcResult.riskClass,
                    corrosionClass: calcResult.corrosionClass,
                  }}
                  calculationId={calcResult.calculationId}
                  className="flex flex-col"
                />

                {monteurSent ? (
                  <div className="flex items-center justify-center rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                    <span className="text-sm font-semibold text-green-400">✓ Uitnodiging verstuurd</span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowMonteurModal(true); setMonteurError(''); setMonteurSent(false); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[#E8761A]/30 bg-[#E8761A]/10 px-4 py-3 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/20 transition-colors"
                  >
                    ✉ Mail monteur
                  </button>
                )}
              </div>

              {/* UUID — copyable chip */}
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Berekening ID</p>
                  <p className="truncate font-mono text-xs text-white/40">{calcResult.calculationId}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(calcResult.calculationId!);
                    setUuidCopied(true);
                    setTimeout(() => setUuidCopied(false), 2000);
                  }}
                  className="ml-3 shrink-0 text-xs text-white/40 transition-colors hover:text-white/70"
                >
                  {uuidCopied ? '✓ Gekopieerd' : 'Kopieer'}
                </button>
              </div>
            </div>
          )}

          {/* Monteur invite modal */}
          {showMonteurModal && (
            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowMonteurModal(false)} />
              <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
                <h2 className="mb-1 text-base font-bold text-white">Monteur uitnodigen</h2>
                <p className="mb-4 text-xs text-white/60 leading-relaxed">
                  De monteur ontvangt een e-mail met de verwachte meetwaarden en een directe inloglink naar het meetformulier.
                </p>
                <label className="mb-1 block text-xs text-white/70">E-mailadres monteur</label>
                <input
                  type="email"
                  value={monteurEmail}
                  onChange={e => setMonteurEmail(e.target.value)}
                  placeholder="monteur@bedrijf.nl"
                  className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSendMonteur()}
                  autoFocus
                />
                {monteurError && <p className="mb-2 text-xs text-red-400">{monteurError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMonteurModal(false)}
                    className="flex-1 rounded-lg border border-white/15 py-2.5 text-sm text-white/70 hover:text-white transition-colors"
                  >
                    Annuleer
                  </button>
                  <button
                    onClick={handleSendMonteur}
                    disabled={monteurSending}
                    className="flex-1 rounded-lg bg-[#E8761A] py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
                  >
                    {monteurSending ? 'Versturen…' : 'Verstuur uitnodiging'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
