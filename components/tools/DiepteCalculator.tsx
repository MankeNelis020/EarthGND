'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/client';
import { EmailRapportButton } from './EmailRapportButton';
import type { DiepteRapportProps } from '@/components/pdf/DiepteRapportTemplate';
import type { User } from '@supabase/supabase-js';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRhoEffective, lithoClassToRhoDry } from '@/lib/calculations';
import type { DiepteResult, LintResult, RiskClassResult, CorrosionClass } from '@/lib/calculations';
import { calcAllMethods, DRIVE_METHOD_LABELS, ACTIVE_DRIVE_METHODS, type DriveMethod, type ZMaxBand, type RefusalLayer } from '@/lib/pipeline/driveability';
import { RodCurveChart } from './RodCurveChart';
import { buildSoilRhoPreview } from '@/lib/pipeline/effective-rho';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { HeroMetric, ScenarioMetric } from '@/components/ui/instrument';
import { IconAlert, IconCheck, IconMail, IconX } from '@/components/ui/icons';
import type { SavedColleague } from '@/lib/colleagues';
import { colleagueDisplayLabel, normalizeColleagueEmail } from '@/lib/colleagues';
import type { ParallelLayout } from '@/lib/pipeline/parallel-policy';
import {
  DEFAULT_ELECTRODE_DIAMETER_MM,
  ELECTRODE_DIAMETER_PRESETS,
  type ElectrodeDiameterPresetId,
  mmToRodDiameterM,
  formatElectrodeDiameterLabel,
} from '@/lib/electrode-diameter';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElectrodeType = 'pen' | 'lint';

interface PenScenarios  { gunstig: DiepteResult; gemiddeld: DiepteResult; ongunstig: DiepteResult }
interface LintScenarios { gunstig: LintResult;   gemiddeld: LintResult;   ongunstig: LintResult   }

type ParallelAdvice = ParallelLayout & {
  zMax?:        ZMaxBand;
  refusalLayer?: RefusalLayer | null;
};

interface CalcResult {
  scenarios: PenScenarios | LintScenarios;
  electrodeType: ElectrodeType;
  riskClass: RiskClassResult;
  corrosionClass: CorrosionClass;
  parallelAdvice: ParallelAdvice | null;
  parallelOption?: ParallelLayout | null;
  creditsRemaining: number;
  calculationId?: string | null;
  persistWarning?: string;
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
    requiresParallel?: boolean;
  };
  // Calibrated model outputs (P1)
  effectiveRho?:       number;       // ρ effectief gemiddeld scenario — input voor riskClass
  dominantLithoClass?: number | null;
  // Pipeline enrichment (present when pipeline is active)
  confidence?:        { level: 'hoog' | 'midden' | 'laag'; label: string; icon: string; showBROBadge: boolean };
  warnings?:          string[];
  uncertaintyBand?:   { typical: number; low: number; high: number; rhoFactorLow: number; rhoFactorHigh: number };
  plausibilityFlags?: { field: string; value: number | string; message: string; severity: 'light' | 'heavy' }[];
  rhoWetSource?:      'l4_local' | 'l3_regional_agnostic' | 'l3_regional' | 'l2_global' | 'l1_literature';
  localDepthHint?:    { medianDepthM: number; n: number; maxDistanceM: number; source: string; confidence: number };
  effectiveRho?:       number;
  dominantLithoClass?: number;
  rhoModel?:           'layered-nl' | 'two-layer' | 'single';
}

interface Profile { plan: string; credits_left: number; credits_purchased: number; credits_reset: string | null }

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESET_GROUPS = [
  {
    label: 'Met aardlek (TT)',
    items: [
      { label: '30 mA',  sublabel: '≤ 1667 Ω', value: 1667,   norm: 'NEN 1010' },
      { label: '100 mA', sublabel: '≤ 500 Ω',  value: 500,    norm: 'NEN 1010' },
      { label: '300 mA', sublabel: '≤ 167 Ω',  value: 167,    norm: 'NEN 1010' },
      { label: '500 mA', sublabel: '≤ 100 Ω',  value: 100,    norm: 'NEN 1010' },
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

type TargetMode = 'rcd' | 'breaker' | 'other' | 'manual';

const TARGET_TABS: { id: TargetMode; label: string; shortLabel: string }[] = [
  { id: 'rcd',     label: 'Met aardlek',    shortLabel: 'Aardlek' },
  { id: 'breaker', label: 'Zonder aardlek', shortLabel: 'Automaat' },
  { id: 'other',   label: 'Overig',         shortLabel: 'Overig' },
  { id: 'manual',  label: 'Handmatig',      shortLabel: 'Handmatig' },
];

function presetGroupForMode(mode: Exclude<TargetMode, 'manual'>) {
  if (mode === 'rcd') return PRESET_GROUPS[0];
  if (mode === 'breaker') return PRESET_GROUPS[1];
  return PRESET_GROUPS[2];
}

function resolveTargetMode(value: number, label?: string): TargetMode {
  if (ZONDER_AARDLEK_VALUES.has(value)) return 'breaker';
  if (PRESET_GROUPS[0].items.some(p => p.value === value)) return 'rcd';
  if (PRESET_GROUPS[2].items.some(p => p.value === value)) return 'other';
  const l = (label ?? '').toLowerCase();
  if (l.includes('62305') || l.includes('bliksem')) return 'other';
  if (l.includes('50522') || l.includes('utiliteit')) return 'other';
  if (l.includes('mA') || l.includes('aardlek')) return 'rcd';
  if (/^[BC]\d/i.test(label ?? '')) return 'breaker';
  return 'manual';
}

function findPreset(mode: TargetMode, value: number) {
  if (mode === 'manual') return null;
  return presetGroupForMode(mode).items.find(p => p.value === value) ?? null;
}

function formatTargetSummary(mode: TargetMode, value: number): string {
  if (mode === 'manual') return `Gekozen: ${fmt(value)} Ω (handmatig)`;
  const preset = findPreset(mode, value);
  if (preset) return `Gekozen: ${preset.label} → ${preset.sublabel}`;
  return `Gekozen: ${fmt(value)} Ω (handmatig)`;
}

// ─── Ra haalbaarheidscheck limits ─────────────────────────────────────────────

const RA_CHECK = [
  { label: 'Aardlek 30 mA (TT)',             max: 1667,   group: 'rcd'     as const },
  { label: 'Aardlek 100 mA (TT)',            max: 500,    group: 'rcd'     as const },
  { label: 'Aardlek 300 mA (TT)',            max: 167,    group: 'rcd'     as const },
  { label: 'Aardlek 500 mA (TT)',            max: 100,    group: 'rcd'     as const },
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
  rodDiameterM,
}: {
  rhoDry: number;
  rhoWet: number;
  gwDepth: number;
  targetResistance: number;
  achievedDepth: number;
  rodDiameterM: number;
}) {
  const maxDepth = Math.max(achievedDepth * 1.3, 6);
  const points = useMemo(() => {
    const pts: { depth: number; R: number }[] = [];
    for (let L = 0.5; L <= maxDepth + 0.01; L += 0.25) {
      const rhoEff = calcRhoEffective(rhoDry, rhoWet, gwDepth, L);
      const R = (rhoEff / (2 * Math.PI * L)) * Math.log((4 * L) / rodDiameterM);
      pts.push({ depth: L, R: Math.round(R * 100) / 100 });
    }
    return pts;
  }, [rhoDry, rhoWet, gwDepth, maxDepth, rodDiameterM]);

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

function CreditsGate({ plan, hasPurchasedCredits }: { plan: string; hasPurchasedCredits?: boolean }) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-8 text-center">
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Geen credits</h3>
      <p className="mb-5 text-sm text-white/70">
        {plan === 'gratis' && !hasPurchasedCredits
          ? 'De Pendiepte Calculator vereist een abonnement of losse credits.'
          : 'Je credits zijn op. Koop credits bij of neem een abonnement.'}
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
    <ScenarioMetric
      label={label}
      sublabel={sublabel}
      value={dimension.toFixed(2)}
      unit={dimensionUnit}
      secondary={`${resistance.toFixed(2)} Ω berekend`}
      dimmed={dimmed}
      highlight={label === 'Gemiddeld'}
    />
  );
}

function RaHaalbaarheidsCheck({ raGemiddeld, raOngunstig }: { raGemiddeld: number; raOngunstig: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-xs font-medium text-white/50">Ra-haalbaarheidscheck</p>
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
              <span className={`shrink-0 ${status === 'pass' ? 'text-emerald-400' : status === 'conditional' ? 'text-amber-400' : 'text-red-400'}`}>
                {status === 'pass' ? <IconCheck /> : status === 'conditional' ? <IconAlert /> : <IconX />}
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
          Overweeg een aardlekschakelaar (30 mA → max 1667 Ω, 300 mA → 167 Ω).
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
  rodDiameterM,
}: {
  method:       DriveMethod;
  refusalLayer: RefusalLayer | null;
  isLimited:    boolean;
  soilSamples:  ReadonlyArray<{ depth: number; lithoClass: number }>;
  zReq:         number;
  rodDiameterM: number;
}) {
  const allMethods = calcAllMethods(soilSamples, zReq, rodDiameterM);
  const methods = Object.keys(DRIVE_METHOD_LABELS) as DriveMethod[];
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-xs font-medium text-white/50">Drijfbaarheid &amp; weigering</p>
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
    <div className={`rounded-panel border p-4 ${colors.border} ${colors.bg}`}>
      <div className="mb-2 flex items-center gap-2">
        <p className={`type-label ${colors.text}`}>
          Corrosieclassificatie — {cc.label}
        </p>
        <span className="type-caption ml-auto tabular-nums">{cc.lifetimeYears}</span>
      </div>
      <p className="type-caption leading-relaxed text-muted">{cc.advies}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DiepteCalculatorProps {
  initialTarget?: number;
  initialLabel?: string;
}

export function DiepteCalculator({ initialTarget, initialLabel }: DiepteCalculatorProps) {
  const { soilData, postcode, huisnummer } = useCalculator();

  const [user, setUser]       = useState<User | null | 'loading'>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [electrodeType, setElectrodeType] = useState<ElectrodeType>('pen');
  const [drijfmethode, setDrijfmethode]   = useState<DriveMethod>('sds');
  const [diameterPreset, setDiameterPreset] = useState<ElectrodeDiameterPresetId>('pen_14');
  const [customDiameterMm, setCustomDiameterMm] = useState(DEFAULT_ELECTRODE_DIAMETER_MM);
  const [parallelRequested, setParallelRequested] = useState(false);

  const electrodeDiameterMm = useMemo(() => {
    if (diameterPreset === 'custom') return customDiameterMm;
    return ELECTRODE_DIAMETER_PRESETS.find(p => p.id === diameterPreset)?.mm ?? DEFAULT_ELECTRODE_DIAMETER_MM;
  }, [diameterPreset, customDiameterMm]);
  const rodDiameterM = useMemo(() => mmToRodDiameterM(electrodeDiameterMm), [electrodeDiameterMm]);

  const [rho, setRho]                   = useState(125);
  const [targetResistance, setTarget]   = useState(initialTarget ?? 10);
  const [targetMode, setTargetMode]     = useState<TargetMode>(() =>
    resolveTargetMode(initialTarget ?? 10, initialLabel),
  );
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
  const [colleagues, setColleagues]         = useState<SavedColleague[]>([]);
  const [colleaguesLoading, setColleaguesLoading] = useState(false);
  const [selectedColleagueId, setSelectedColleagueId] = useState('');
  const [saveAsColleague, setSaveAsColleague] = useState(false);
  const [colleagueNameDraft, setColleagueNameDraft] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('profiles').select('plan, credits_left, credits_purchased, credits_reset').eq('id', data.user.id).single()
          .then(({ data: p }: { data: Profile | null }) => { if (p) setProfile(p); });
      }
    });
  }, []);

  useEffect(() => {
    if (!showMonteurModal) return;
    setColleaguesLoading(true);
    fetch('/api/colleagues')
      .then(r => r.json())
      .then(data => setColleagues(data.colleagues ?? []))
      .catch(() => setColleagues([]))
      .finally(() => setColleaguesLoading(false));
  }, [showMonteurModal]);

  useEffect(() => {
    if (!soilData) return;
    const preview = buildSoilRhoPreview({
      samples: soilData.samples?.map(s => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })),
      gwDepth: soilData.groundwaterDepth,
      dominantLithoClass: soilData.dominantLithoClass,
      dominantRho: soilData.dominantRho,
      dataSource: soilData.dataSource,
    });
    setRho(preview.pipelineRho);
  }, [soilData]);
  useEffect(() => { if (soilData?.groundwaterDepth != null) setGw(soilData.groundwaterDepth); }, [soilData]);

  const soilPreview = useMemo(() => {
    if (!soilData) return null;
    return buildSoilRhoPreview({
      samples: soilData.samples?.map(s => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })),
      gwDepth: groundwaterDepth,
      dominantLithoClass: soilData.dominantLithoClass,
      dominantRho: soilData.dominantRho,
      dataSource: soilData.dataSource,
    });
  }, [soilData, groundwaterDepth]);

  if (user === 'loading') return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/3" />;
  if (!user) return <LoginGate />;
  if (profile && profile.credits_left <= 0) {
    return <CreditsGate plan={profile.plan} hasPurchasedCredits={(profile.credits_purchased ?? 0) > 0} />;
  }

  // Profile is fetched async after auth — treat null (still loading) as non-pro
  // Pro features require active subscription; purchased-only users on gratis keep basic calculator access.
  const isPro = profile !== null && profile.plan !== 'gratis';

  function handleTargetModeChange(mode: TargetMode) {
    setTargetMode(mode);
    setCalcResult(null);
    if (mode === 'manual') return;
    const group = presetGroupForMode(mode);
    if (!group.items.some(p => p.value === targetResistance)) {
      setTarget(group.items[0].value);
    }
  }

  function selectPreset(value: number) {
    setTarget(value);
    setCalcResult(null);
  }

  // Dominante lithoClass + droge zone (P1 leidingwerk)
  const lithoClass = soilPreview?.lithoClass ?? soilData?.dominantLithoClass ?? null;
  // Dry-zone ρ: average lithoClassToRhoDry of BRO samples shallower than GHG.
  // Uses the DRY table (not the GENERAL table) for physically correct dry-zone ρ.
  // When no samples are above GHG, fall back to null (API uses ratio fallback).
  const samplesAboveGhg = (soilData?.samples ?? []).filter(s => Math.abs(s.depth) < groundwaterDepth);
  const rhoDryProfile = samplesAboveGhg.length > 0
    ? Math.round(samplesAboveGhg.reduce((sum, s) => sum + lithoClassToRhoDry(s.lithoClass), 0) / samplesAboveGhg.length)
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
          rho: rho,
          targetResistance,
          groundwaterDepth,
          ph,
          postcode: postcode || undefined,
          huisnummer: huisnummer.trim() || undefined,
          electrodeType,
          lithoClass: lithoClass ?? undefined,
          rhoDryOverride: rhoDryProfile ?? undefined,
          hasBroProfile: hasBroProfile || undefined,
          lintBurialDepth: electrodeType === 'lint' ? lintBurialDepth : undefined,
          lintConductorDiameter: electrodeType === 'lint' ? lintDiameter : undefined,
          // Driveability
          drijfmethode: electrodeType === 'pen' ? drijfmethode : undefined,
          electrodeDiameterMm: electrodeType === 'pen' ? electrodeDiameterMm : undefined,
          parallelRequested: electrodeType === 'pen' && parallelRequested ? true : undefined,
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
      if (profile) {
        setProfile(p => p ? { ...p, credits_left: data.creditsRemaining } : p);
        window.dispatchEvent(new CustomEvent('earthgnd:credits-updated', { detail: { credits: data.creditsRemaining } }));
      }
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMonteur() {
    if (!calcResult?.calculationId) return;
    const email = normalizeColleagueEmail(monteurEmail);
    if (!email || !email.includes('@')) { setMonteurError('Voer een geldig e-mailadres in.'); return; }
    setMonteurSending(true);
    setMonteurError('');
    try {
      await fetch(`/api/calculations/${calcResult.calculationId}/draft`, { method: 'POST' });

      const res = await fetch(`/api/calculations/${calcResult.calculationId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monteurEmail: email,
          colleagueId: selectedColleagueId || undefined,
          saveColleague: saveAsColleague && !selectedColleagueId ? { name: colleagueNameDraft.trim() } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMonteurError(data.error ?? 'Verzenden mislukt'); return; }
      setMonteurSent(true);
      setShowMonteurModal(false);
      setSelectedColleagueId('');
      setSaveAsColleague(false);
      setColleagueNameDraft('');
    } catch {
      setMonteurError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setMonteurSending(false);
    }
  }

  function openMonteurModal() {
    setShowMonteurModal(true);
    setMonteurError('');
    setMonteurSent(false);
    setSelectedColleagueId('');
    setMonteurEmail('');
    setSaveAsColleague(false);
    setColleagueNameDraft('');
  }

  function selectColleague(id: string) {
    setSelectedColleagueId(id);
    if (!id) {
      setMonteurEmail('');
      return;
    }
    const c = colleagues.find(x => x.id === id);
    if (c) setMonteurEmail(c.email);
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
  const drive = calcResult?.driveability;
  const parallelForced = calcResult?.parallelAdvice?.reason === 'driveability'
    && (calcResult.parallelAdvice.aantalPennen ?? 1) > 1;
  const driveDepthCapped = drive?.requiresParallel === true && dwightDepth > 0;
  const rodLength = driveDepthCapped
    ? (calcResult?.parallelAdvice?.zMax?.typical ?? drive?.zMax.typical ?? dwightDepth)
    : dwightDepth;
  const numRods = parallelForced ? calcResult!.parallelAdvice!.aantalPennen : 1;
  const rodSpacing = parallelForced ? (calcResult?.parallelAdvice?.minAfstand ?? 0) : 0;
  const parallelOption = calcResult?.parallelOption ?? null;

  return (
    <div className="flex flex-col gap-section">
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
      <div className="panel p-5">

        {/* Electrode type toggle */}
        <div className="mb-5">
          <FieldLabel>Elektrode type</FieldLabel>
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
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={parallelRequested}
                  onChange={(e) => { setParallelRequested(e.target.checked); setCalcResult(null); }}
                  className="mt-0.5 accent-[#E8761A]"
                />
                <span className="text-xs text-white/70">
                  <span className="font-medium text-white/90">Parallelschakeling uitrekenen</span>
                  {' '}— optioneel; standaard adviseren we één pen tenzij indrijfbaarheid het onmogelijk maakt.
                </span>
              </label>
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-white/70">Elektrodediameter</p>
                <select
                  value={diameterPreset}
                  onChange={(e) => {
                    setDiameterPreset(e.target.value as ElectrodeDiameterPresetId);
                    setCalcResult(null);
                  }}
                  className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A]/50 focus:outline-none"
                >
                  {ELECTRODE_DIAMETER_PRESETS.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#111]">
                      {p.label}{p.id !== 'custom' ? ` — ${p.mm} mm` : ''}
                    </option>
                  ))}
                </select>
                {diameterPreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={4}
                      max={50}
                      step={0.1}
                      value={customDiameterMm}
                      onChange={(e) => { setCustomDiameterMm(Number(e.target.value)); setCalcResult(null); }}
                      className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A]/50 focus:outline-none"
                    />
                    <span className="text-xs text-white/50">mm</span>
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-white/35">
                  Diameter van de geslagen elektrode (niet de aansluitdraad). Standaard: {formatElectrodeDiameterLabel(14)}.
                </p>
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

        {/* Target resistance — tabbed presets (one choice) */}
        <div className="mb-5">
          <FieldLabel>Doelweerstand</FieldLabel>
          <p className="mb-3 text-xs text-white/50">
            Selecteer één doelweerstand — niet per categorie.
          </p>

          <div className="mb-3 rounded-lg border border-[#E8761A]/30 bg-[#E8761A]/8 px-3 py-2.5 text-sm font-semibold text-[#E8761A]">
            {formatTargetSummary(targetMode, targetResistance)}
          </div>

          {initialTarget !== undefined && (
            <div className="mb-3 rounded-lg border border-[#E8761A]/20 bg-[#E8761A]/5 px-3 py-2 text-xs text-[#E8761A]/90">
              Vooringevuld vanuit Weerstand Calculator{initialLabel ? ` (${initialLabel})` : ''}: Ra ≤ {initialTarget} Ω
            </div>
          )}

          <div
            className="mb-3 flex gap-1 overflow-x-auto pb-1 scrollbar-thin"
            role="tablist"
            aria-label="Type doelweerstand"
          >
            {TARGET_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={targetMode === tab.id}
                onClick={() => handleTargetModeChange(tab.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-all sm:px-4 ${
                  targetMode === tab.id
                    ? 'border-[#E8761A] bg-[#E8761A]/15 text-[#E8761A]'
                    : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                }`}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {targetMode === 'manual' ? (
            <div
              role="tabpanel"
              className="rounded-xl border border-white/8 bg-white/3 p-4"
            >
              <p className="mb-3 text-xs text-white/60 leading-relaxed">
                Voer uw eigen Ra-doel in (Ω), bijvoorbeeld uit een meting of projecteis.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={targetResistance}
                  onChange={e => { setTarget(Number(e.target.value)); setCalcResult(null); }}
                  className="w-28 rounded-lg border border-[#E8761A]/40 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                  aria-label="Doelweerstand handmatig in ohm"
                />
                <span className="text-sm text-white/60">Ω</span>
              </div>
            </div>
          ) : (
            <div role="tabpanel" className="rounded-xl border border-white/8 bg-white/3 p-3">
              {targetMode === 'breaker' && (
                <div className="mb-3 rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2.5 text-xs text-orange-300 leading-relaxed">
                  <strong className="font-semibold">TT zonder aardlekschakelaar</strong> — automaat als enige beveiliging
                  stelt zeer strenge eisen (&lt; 1 Ω). In de meeste Nederlandse grond is dit niet haalbaar
                  met één verticale pen. De calculator toont de theoretisch benodigde diepte en alternatieven.
                </div>
              )}
              <div className={`grid gap-1.5 ${
                targetMode === 'breaker' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
              }`}>
                {presetGroupForMode(targetMode).items.map(p => {
                  const selected = targetResistance === p.value;
                  return (
                    <button
                      key={`${p.label}-${p.value}`}
                      type="button"
                      onClick={() => selectPreset(p.value)}
                      className={`rounded-lg border px-2 py-2.5 text-left text-xs transition-all ${
                        selected
                          ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A] ring-1 ring-[#E8761A]/30'
                          : 'border-white/8 bg-white/5 text-white/60 hover:border-white/15 hover:text-white'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-1">
                        <span>
                          <span className="block font-semibold">{p.label}</span>
                          <span className="block text-[10px] text-white/70 mt-0.5">{p.sublabel}</span>
                        </span>
                        {selected && (
                          <span className="shrink-0 text-[#E8761A]" aria-hidden="true">✓</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ρ slider */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/70">
            Bodemweerstand ρ
            {soilPreview && soilData && (
              <span className="ml-2 text-green-400">
                ← effectief {soilPreview.effectiveRho} Ω·m
                {soilPreview.model === 'layered-nl' && ' (gelaagd NL)'}
                {soilPreview.model === 'two-layer' && ' (droog/nat)'}
                {soilData.dataSource && ` · ${soilData.dataSource}`}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <input type="range" min="10" max="5000" step="10" value={rho}
              onChange={e => { setRho(Number(e.target.value)); setCalcResult(null); }}
              className="flex-1 accent-[#E8761A]" />
            <div className="flex items-center gap-1">
              <input type="number" min="1" value={rho}
                onChange={e => { setRho(Number(e.target.value)); setCalcResult(null); }}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
              <span className="text-xs text-white/60">Ω·m</span>
            </div>
          </div>
          {/* Two-layer indicator */}
          {lithoClass && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-white/70">
              <span className="inline-block h-2 w-3 rounded-sm bg-[#78491A]/70" />
              droog: {calcResult?.rhoDry ?? soilPreview?.rhoDry ?? '—'} Ω·m
              <span className="inline-block h-2 w-3 rounded-sm bg-[#1A3A5C]/90" />
              verzadigd: {calcResult?.rhoWet ?? soilPreview?.rhoWet ?? '—'} Ω·m
              {calcResult?.effectiveRho != null && (
                <><span className="text-white/30">·</span> effectief: {Math.round(calcResult.effectiveRho)} Ω·m</>
              )}
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
        className="btn-primary"
      >
        {loading ? 'Berekening...' : `Bereken ${electrodeType === 'pen' ? 'pendiepte' : 'lintlengte'} — 1 credit`}
      </button>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      {/* Results */}
      {calcResult && (
        <div className="flex flex-col gap-section result-block">
          {(() => {
            const gem = calcResult.scenarios.gemiddeld as DiepteResult | LintResult;
            const heroDim = scenarioDim(gem);
            const heroUnit = calcResult.electrodeType === 'pen' ? 'm diep' : 'm lint';
            return (
              <HeroMetric
                label={calcResult.electrodeType === 'pen' ? 'Benodigde pendiepte (gemiddeld)' : 'Benodigde lintlengte (gemiddeld)'}
                value={heroDim.toFixed(2)}
                unit={heroUnit}
                context={`doel ≤ ${fmt(targetResistance)} Ω · GHG ${groundwaterDepth} m`}
                pulseKey={`${heroDim}-${targetResistance}`}
              />
            );
          })()}

          {/* Soil cross-section + aanbevolen config */}
          {calcResult.electrodeType === 'pen' && rodLength > 0 && (
            <div className="panel overflow-hidden">
              <div className="border-b border-white/6 px-5 py-3 flex items-center justify-between">
                <p className="text-xs font-medium text-white/50">
                  Aanbevolen configuratie
                </p>
                <p className="text-xs font-bold text-white">
                  {parallelForced
                    ? `${numRods} pennen × ${rodLength.toFixed(1)} m — ${calcResult.parallelAdvice?.refusalLayer?.soil ?? 'bodem'} begrenst diepte`
                    : driveDepthCapped && rodLength < dwightDepth - 0.05
                    ? `1 pen — ${rodLength.toFixed(1)} m (indrijfbaarheid; Dwight ${dwightDepth.toFixed(1)} m)`
                    : `1 pen — ${rodLength.toFixed(2)} m diep`}
                </p>
              </div>
              {parallelForced && calcResult.parallelAdvice?.targetUnreachable && (
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
                    {calcResult.effectiveRho != null && (
                      <span className="flex items-center gap-1.5 text-white/80">
                        Effectief (gemiddeld) — ρ ≈ {Math.round(calcResult.effectiveRho)} Ω·m
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* R vs. diepte — interactieve scrubber (pen only, na berekening) */}
          {calcResult.electrodeType === 'pen' &&
           calcResult.rhoDry != null && calcResult.rhoWet != null &&
           calcResult.gwGemiddeld != null && dwightDepth > 0 && (
            <RodCurveChart
              targetResistance={targetResistance}
              rhoDry={calcResult.rhoDry}
              rhoWet={calcResult.rhoWet}
              gwGunstig={calcResult.gwGunstig  ?? groundwaterDepth}
              gwGemiddeld={calcResult.gwGemiddeld}
              gwOngunstig={calcResult.gwOngunstig ?? groundwaterDepth + 3}
              computedDepth={dwightDepth}
            />
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
                Overweeg een aardlekschakelaar (30 mA → max 1667 Ω, 300 mA → 167 Ω), aardmat, of meerdere pennen in een betere grondzone.
              </div>
            )
          )}

          {/* Three scenarios */}
          <div className="surface-panel p-gutter">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="type-label text-brand">
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

            {calcResult.localDepthHint && calcResult.localDepthHint.n >= 1 && (
              <div className="mt-2 rounded-lg border border-[#E8761A]/20 bg-[#E8761A]/5 px-4 py-2.5 text-xs text-[#F5EFE6]/80">
                Lokale veldmetingen
                {calcResult.localDepthHint.source === 'exact_address' ? ' op dit adres' : ` binnen ${calcResult.localDepthHint.maxDistanceM} m`}:
                {' '}gemiddeld ~{calcResult.localDepthHint.medianDepthM.toFixed(1)} m diepte
                ({calcResult.localDepthHint.n} eerdere meting{calcResult.localDepthHint.n > 1 ? 'en' : ''}).
              </div>
            )}

            {/* Verplicht parallel (indrijfbaarheid) */}
            {parallelForced && calcResult.parallelAdvice && (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
                <p className="mb-2 text-sm font-semibold text-red-400">
                  {calcResult.parallelAdvice.aantalPennen} pennen nodig — indrijfweerstand begrenst diepte
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

            {/* Optioneel parallel (gebruiker vroeg expliciet) */}
            {parallelRequested && parallelOption && !parallelForced && (
              <div className="mt-4 rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
                <p className="mb-2 text-sm font-semibold text-orange-400">
                  {parallelOption.aantalPennen === 1
                    ? 'Parallelschakeling niet nodig — één pen haalt het doel op Dwight-diepte'
                    : `Parallelschakeling op Dwight-diepte — ${parallelOption.aantalPennen} pennen`}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                  <div>
                    <span className="text-white/70">Diepte per pen</span>
                    <p className="font-semibold text-white">{dwightDepth.toFixed(1)} m</p>
                  </div>
                  <div>
                    <span className="text-white/70">Min. onderlinge afstand</span>
                    <p className="font-semibold text-white">{parallelOption.minAfstand} m</p>
                  </div>
                  <div>
                    <span className="text-white/70">Ra enkelvoudig @ {dwightDepth.toFixed(0)} m</span>
                    <p className="font-semibold text-white">{parallelOption.rSingle} Ω</p>
                  </div>
                  <div>
                    <span className="text-white/70">Ra parallel (incl. koppeling)</span>
                    <p className="font-semibold text-[#E8761A]">{parallelOption.rParallel} Ω</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Resistance vs depth graph (pen only, with two-layer data) */}
          {calcResult.electrodeType === 'pen' && calcResult.rhoDry && calcResult.rhoWet && (
            <div className="panel p-5">
              <p className="mb-3 text-xs font-medium text-white/50">
                Weerstand vs. diepte (gemiddeld scenario)
              </p>
              <RvsDiepteGraph
                rhoDry={calcResult.rhoDry}
                rhoWet={calcResult.rhoWet}
                gwDepth={calcResult.gwGemiddeld ?? groundwaterDepth + 1.5}
                targetResistance={targetResistance}
                achievedDepth={scenarioDim(calcResult.scenarios.gemiddeld as DiepteResult)}
                rodDiameterM={rodDiameterM}
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
              rodDiameterM={rodDiameterM}
            />
          )}

          {/* Ra-haalbaarheidscheck — uses combined Ra when driveability forces multiple rods */}
          <RaHaalbaarheidsCheck
            raGemiddeld={
              parallelForced && calcResult.parallelAdvice?.rParallel != null
                ? calcResult.parallelAdvice.rParallel
                : (calcResult.scenarios.gemiddeld as DiepteResult | LintResult).achievedResistance
            }
            raOngunstig={
              parallelForced && calcResult.parallelAdvice?.rParallel != null
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
            Berekening met Dwight-formule{calcResult.confidence?.showBROBadge ? ' + BRO bodemdata' : ''}: droge zone
            boven GHG (ρ_droog ≈ {calcResult.rhoDry} Ω·m), verzadigde zone onder GHG (ρ_nat ≈ {calcResult.rhoWet} Ω·m).
            De drie scenario&apos;s modelleren het grondwaterpeil in natte (GHG), gemiddelde (+1,5 m)
            en droge (+3,0 m) periode. Meet altijd ter plaatse na installatie conform NEN 3140.
          </p>

          {/* CTAs + UUID — always visible after a successful calculation */}
          <div className="flex flex-col gap-2">
            {!calcResult.calculationId && (
              <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-3 py-2.5 text-xs text-yellow-300 leading-relaxed">
                Monteur-koppeling en berekening-ID zijn niet opgeslagen.
                {calcResult.persistWarning?.includes('schema cache')
                  ? ' Databasekolommen ontbreken of zijn verouderd — voer supabase/ensure_calculations_canonical.sql uit en herlaad het API-schema.'
                  : calcResult.persistWarning
                  ? ` (${calcResult.persistWarning})`
                  : ''}
                {' '}U kunt het rapport wel per e-mail ontvangen.
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <EmailRapportButton
                tool="diepte"
                inputValues={{
                  ...(postcode ? { 'Postcode': postcode } : {}),
                  'Elektrodetype': calcResult.electrodeType === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint',
                  'Bodemweerstand ρ': `${rho} Ω·m`,
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
                  rho: rho,
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

              {calcResult.calculationId ? (
                monteurSent ? (
                  <div className="flex items-center justify-center rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                    <span className="text-sm font-semibold text-green-400">✓ Uitnodiging verstuurd</span>
                  </div>
                ) : (
                  <button
                    onClick={openMonteurModal}
                    className="flex items-center justify-center gap-2 rounded-md border border-brand/30 bg-brand-muted px-4 py-3 text-sm font-semibold text-brand hover:bg-brand/20 transition-colors"
                  >
                    <IconMail className="h-4 w-4" />
                    Uitnodigen installateur
                  </button>
                )
              ) : (
                <div
                  className="flex items-center justify-center rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-white/40"
                  title="Berekening niet opgeslagen — veldmeting niet beschikbaar"
                >
                  ✉ Uitnodigen installateur (niet beschikbaar)
                </div>
              )}
            </div>

            {calcResult.calculationId && (
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-white/35">Berekening ID</p>
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
            )}
          </div>

          {/* Monteur invite modal */}
          {showMonteurModal && (
            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowMonteurModal(false)} />
              <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
                <h2 className="mb-1 text-base font-bold text-white">Monteur uitnodigen</h2>
                <p className="mb-4 text-xs text-white/60 leading-relaxed">
                  Kies een opgeslagen collega of voer een e-mailadres in. Per berekening gaat één uitnodiging naar één installateur.
                </p>

                {colleaguesLoading ? (
                  <p className="mb-3 text-xs text-white/40">Collega&apos;s laden…</p>
                ) : colleagues.length > 0 ? (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs text-white/70">Kies collega</label>
                    <select
                      value={selectedColleagueId}
                      onChange={e => selectColleague(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none"
                    >
                      <option value="">— Handmatig e-mailadres —</option>
                      {colleagues.map(c => (
                        <option key={c.id} value={c.id}>
                          {colleagueDisplayLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-white/45">
                    Voeg vaste contactpersonen toe via Dashboard → Mijn collega&apos;s.
                  </p>
                )}

                <label className="mb-1 block text-xs text-white/70">E-mailadres installateur</label>
                <input
                  type="email"
                  value={monteurEmail}
                  onChange={e => {
                    setMonteurEmail(e.target.value);
                    setSelectedColleagueId('');
                  }}
                  placeholder="monteur@bedrijf.nl"
                  className="mb-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSendMonteur()}
                  autoFocus={colleagues.length === 0}
                />

                {!selectedColleagueId && monteurEmail.includes('@') && (
                  <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-md border border-white/8 bg-white/3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={saveAsColleague}
                      onChange={e => setSaveAsColleague(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <span className="text-xs text-white/65">
                      <span className="font-medium text-white/85">Onthouden als collega</span>
                      {saveAsColleague && (
                        <input
                          type="text"
                          value={colleagueNameDraft}
                          onChange={e => setColleagueNameDraft(e.target.value)}
                          placeholder="Naam (optioneel)"
                          className="mt-2 block w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder-white/25 focus:border-brand/50 focus:outline-none"
                        />
                      )}
                    </span>
                  </label>
                )}
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
