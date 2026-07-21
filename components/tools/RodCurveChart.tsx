'use client';

/**
 * RodCurveChart — interactieve weerstand-vs-diepte grafiek voor aardpennen.
 *
 * Mobile-first: één set pointer events (onPointerDown/Move/Up) dekt vinger én muis.
 * setPointerCapture houdt het slepen actief ook als de vinger buiten de SVG gaat.
 * touch-action: none voorkomt dat de pagina meescrollt tijdens het slepen.
 *
 * De marker snapt altijd op de gemiddeld-curve: de x-positie (diepte) bepaalt
 * de gebruiker, de Ω-waarde volgt live uit de Dwight-formule + calcRhoEffective.
 *
 * Drie curves:
 *   gunstig   (groen, dim)  — GWT op gwGunstig
 *   gemiddeld (oranje, main) — GWT op gwGemiddeld  ← scrubber volgt deze
 *   ongunstig (rood, dim)   — GWT op gwOngunstig
 *
 * Alleen de marker + labels re-renderen tijdens slepen; de drie curve-paden
 * zijn statische SVG strings (useMemo, veranderen alleen bij nieuwe calc).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcRhoEffective } from '@/lib/calculations';

const ROD_D = 0.014; // 14 mm standaard aardpen

function dwightR(rhoEff: number, L: number): number {
  if (L <= 0.01 || rhoEff <= 0) return Infinity;
  return (rhoEff / (2 * Math.PI * L)) * (Math.log((8 * L) / ROD_D) - 1);
}

/** Bisectiemethode: zoek de diepte waarbij gemiddeld-curve de target snijdt. */
function bisectDepth(
  target: number,
  rhoDry: number,
  rhoWet: number,
  gwGemiddeld: number,
  dMin: number,
  dMax: number,
): number {
  const rAt = (d: number) => dwightR(calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, d), d);
  if (target >= rAt(dMin)) return dMin;
  if (target <= rAt(dMax)) return dMax;
  let lo = dMin, hi = dMax;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (rAt(mid) > target) { lo = mid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

export interface RodCurveChartProps {
  targetResistance: number;
  rhoDry:           number;
  rhoWet:           number;
  gwGunstig:        number;
  gwGemiddeld:      number;
  gwOngunstig:      number;
  computedDepth:    number; // gemiddeld scenario
}

export function RodCurveChart({
  targetResistance,
  rhoDry,
  rhoWet,
  gwGunstig,
  gwGemiddeld,
  gwOngunstig,
  computedDepth,
}: RodCurveChartProps) {
  const svgRef                = useRef<SVGSVGElement>(null);
  const [depth, setDepth]     = useState(computedDepth);
  const [dragging, setDragging] = useState(false);
  const [ohmInput, setOhmInput] = useState('');
  // Tracks the start position of each touch gesture for direction detection
  const pointerStartRef = useRef<{ x: number; y: number; captured: boolean } | null>(null);

  // Marker volgt nieuwe berekening
  useEffect(() => { setDepth(computedDepth); }, [computedDepth]);

  // ── SVG-layout ──────────────────────────────────────────────────────────────
  const W = 360, H = 220;
  const PAD = { l: 48, r: 16, t: 14, b: 34 };
  const iw  = W - PAD.l - PAD.r;
  const ih  = H - PAD.t - PAD.b;

  const D_MIN = 0.3;
  const D_MAX = Math.max(computedDepth * 1.8, 8);

  // R_MAX: net boven het maximum dat zichtbaar is bij D_MIN in het ongunstige scenario
  const rMaxRaw = dwightR(calcRhoEffective(rhoDry, rhoWet, gwOngunstig, D_MIN), D_MIN);
  const step    = rMaxRaw <= 200 ? 50 : rMaxRaw <= 500 ? 100 : rMaxRaw <= 1000 ? 250 : 500;
  const R_MAX   = Math.min(Math.ceil(rMaxRaw * 1.05 / step) * step, 3000);

  // Coördinaat-transformaties (stabiel tussen renders)
  const xOf      = (d: number) => PAD.l + ((d - D_MIN) / (D_MAX - D_MIN)) * iw;
  const yOf      = (r: number) => PAD.t + (1 - Math.min(r, R_MAX) / R_MAX) * ih;
  const depthOfX = (x: number) => Math.min(D_MAX, Math.max(D_MIN, D_MIN + ((x - PAD.l) / iw) * (D_MAX - D_MIN)));

  // ── Drie statische curvepaden ───────────────────────────────────────────────
  const { pathGun, pathGem, pathOng } = useMemo(() => {
    const STEPS = 300;
    const pGun: string[] = [], pGem: string[] = [], pOng: string[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const d    = D_MIN + (i / STEPS) * (D_MAX - D_MIN);
      const rGun = dwightR(calcRhoEffective(rhoDry, rhoWet, gwGunstig,   d), d);
      const rGem = dwightR(calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, d), d);
      const rOng = dwightR(calcRhoEffective(rhoDry, rhoWet, gwOngunstig, d), d);
      if (rGun <= R_MAX) pGun.push(`${xOf(d).toFixed(1)},${yOf(rGun).toFixed(1)}`);
      if (rGem <= R_MAX) pGem.push(`${xOf(d).toFixed(1)},${yOf(rGem).toFixed(1)}`);
      if (rOng <= R_MAX) pOng.push(`${xOf(d).toFixed(1)},${yOf(rOng).toFixed(1)}`);
    }
    return {
      pathGun: pGun.length > 1 ? 'M' + pGun.join(' L') : '',
      pathGem: pGem.length > 1 ? 'M' + pGem.join(' L') : '',
      pathOng: pOng.length > 1 ? 'M' + pOng.join(' L') : '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhoDry, rhoWet, gwGunstig, gwGemiddeld, gwOngunstig, D_MAX, R_MAX]);

  // ── Gridticks ───────────────────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    const s = R_MAX <= 200 ? 50 : R_MAX <= 600 ? 100 : R_MAX <= 1500 ? 250 : 500;
    const t: number[] = [];
    for (let v = 0; v <= R_MAX; v += s) t.push(v);
    return t;
  }, [R_MAX]);

  const xTicks = useMemo(() => {
    const s = D_MAX <= 8 ? 1 : D_MAX <= 16 ? 2 : 5;
    const t: number[] = [];
    for (let d = 1; d <= D_MAX; d += s) t.push(d);
    return t;
  }, [D_MAX]);

  // ── Live markerwaarden (alleen deze re-renderen tijdens slepen) ─────────────
  const currentR    = dwightR(calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, depth), depth);
  const cx          = xOf(depth);
  const cy          = yOf(currentR);
  const targetY     = yOf(targetResistance);
  const labelLeft   = cx > PAD.l + iw * 0.58;
  const labelYClamped = Math.min(Math.max(cy - 12, PAD.t + 22), H - PAD.b - 34);
  const aboveTarget = currentR > targetResistance;

  // ── Pointer events (één set voor vinger én muis) ────────────────────────────
  const scrub = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x    = ((e.clientX - rect.left) / rect.width) * W;
    setDepth(depthOfX(x));
  // depthOfX is stable (no deps change between renders that affect this)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D_MIN, D_MAX, iw]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, captured: false };
    // Mouse: capture immediately (no scroll conflict)
    if (e.pointerType === 'mouse') {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerStartRef.current.captured = true;
      setDragging(true);
      scrub(e);
    }
  }, [scrub]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (!start.captured) {
      // Touch: wait for direction intent before capturing
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx < 4 && dy < 4) return;           // not moved enough yet
      if (dy > dx) { pointerStartRef.current = null; return; } // vertical → let browser scroll
      e.currentTarget.setPointerCapture(e.pointerId);
      start.captured = true;
      setDragging(true);
    }
    scrub(e);
  }, [scrub]);

  const endDrag = useCallback(() => {
    pointerStartRef.current = null;
    setDragging(false);
  }, []);

  // ── Inverse: typ Ω → marker springt naar benodigde diepte ──────────────────
  const goToOhm = () => {
    const v = parseFloat(ohmInput.replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      setDepth(bisectDepth(v, rhoDry, rhoWet, gwGemiddeld, D_MIN, D_MAX));
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/6 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
          Weerstand vs. diepte — sleep om te verkennen
        </p>
      </div>

      <div className="px-4 pt-3 pb-4">
        {/* SVG chart */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', display: 'block', touchAction: 'pan-y', cursor: dragging ? 'grabbing' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Grid + y-labels */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="#ffffff0d" strokeWidth="0.6" />
              <text x={PAD.l - 6} y={yOf(v) + 3.5} textAnchor="end" fill="#6b7280" fontSize="9">{v}</text>
            </g>
          ))}

          {/* x-labels */}
          {xTicks.map(d => (
            <text key={d} x={xOf(d)} y={H - 10} textAnchor="middle" fill="#6b7280" fontSize="9">{d}m</text>
          ))}

          {/* Y-as label */}
          <text
            x={11} y={PAD.t + ih / 2} textAnchor="middle"
            transform={`rotate(-90 11 ${PAD.t + ih / 2})`}
            fill="#6b7280" fontSize="9"
          >
            R (Ω)
          </text>

          {/* Doellijn */}
          {targetResistance <= R_MAX && (
            <>
              <line x1={PAD.l} x2={W - PAD.r} y1={targetY} y2={targetY}
                stroke="#6b7280" strokeWidth="1" strokeDasharray="5 4" />
              <text x={W - PAD.r} y={targetY - 4} textAnchor="end" fill="#9ca3af" fontSize="9">
                {targetResistance} Ω
              </text>
            </>
          )}

          {/* Gunstig-curve (groen, dim) */}
          {pathGun && (
            <path d={pathGun} fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.28" strokeLinecap="round" />
          )}

          {/* Ongunstig-curve (rood, dim) */}
          {pathOng && (
            <path d={pathOng} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.28" strokeLinecap="round" />
          )}

          {/* Gemiddeld-curve (oranje, hoofd) */}
          {pathGem && (
            <path d={pathGem} fill="none" stroke="#E8761A" strokeWidth="2.5" strokeLinecap="round" />
          )}

          {/* Berekende diepte — vaste stippellijn als referentie */}
          <line
            x1={xOf(computedDepth)} x2={xOf(computedDepth)}
            y1={PAD.t} y2={H - PAD.b}
            stroke="#E8761A" strokeWidth="1" strokeDasharray="2 4" opacity="0.35"
          />

          {/* Crosshair */}
          <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b}
            stroke="#E8761A" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45" />
          <line x1={PAD.l} x2={cx} y1={cy} y2={cy}
            stroke="#E8761A" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45" />

          {/* Marker — groot genoeg voor dikke vingers */}
          <circle cx={cx} cy={cy} r="24" fill="transparent" />
          <circle cx={cx} cy={cy} r={dragging ? 8 : 6} fill="#E8761A" stroke="#111" strokeWidth="2" />

          {/* Waardelabel — flipt bij rechterrand */}
          <g transform={`translate(${labelLeft ? cx - 10 : cx + 10}, ${labelYClamped})`}>
            <text
              textAnchor={labelLeft ? 'end' : 'start'}
              fill="#E8761A" fontSize="13" fontWeight="700"
            >
              {depth.toFixed(2)} m
            </text>
            <text
              textAnchor={labelLeft ? 'end' : 'start'} y="17"
              fill={aboveTarget ? '#f87171' : '#4ade80'} fontSize="13" fontWeight="700"
            >
              {Number.isFinite(currentR) ? `${Math.round(currentR)} Ω` : '—'}
            </text>
          </g>
        </svg>

        {/* Statusregel onder de grafiek */}
        <p className="mt-1 text-[11px] text-white/40 leading-snug">
          {aboveTarget
            ? `Bij ${depth.toFixed(1)} m is R ≈ ${Math.round(currentR)} Ω — hoger dan het doel van ${targetResistance} Ω`
            : `Bij ${depth.toFixed(1)} m is R ≈ ${Math.round(currentR)} Ω ✓`}
        </p>

        {/* Legenda */}
        <div className="mt-2 flex items-center gap-4 text-[10px] text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-[#22c55e] opacity-60" />gunstig
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-[#E8761A]" />gemiddeld
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-[#ef4444] opacity-60" />ongunstig
          </span>
        </div>

        {/* Inverse: typ Ω → springt naar diepte */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder={`bijv. ${targetResistance}`}
            value={ohmInput}
            onChange={e => setOhmInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && goToOhm()}
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#E8761A] focus:outline-none"
            aria-label="Gewenste weerstand in ohm"
          />
          <button
            onClick={goToOhm}
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Toon diepte bij deze Ω
          </button>
        </div>
      </div>
    </div>
  );
}
