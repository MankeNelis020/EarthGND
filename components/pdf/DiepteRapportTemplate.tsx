import {
  Document, Page, Text, View, StyleSheet,
  Svg, Rect, Line, Circle, Polygon, G,
} from '@react-pdf/renderer';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  dark:     '#1C1917',
  orange:   '#E8761A',
  cream:    '#F5EFE6',
  gray:     '#64748B',
  grayLt:   '#94A3B8',
  border:   '#E2E8F0',
  bg:       '#F8FAFC',
  dry:      '#78491A',
  wet:      '#1A3A5C',
  gwLine:   '#3B82F6',
  greenTx:  '#166534',
  greenBd:  '#86EFAC',
  greenBg:  '#DCFCE7',
  yellowTx: '#92400E',
  yellowBd: '#FDE68A',
  yellowBg: '#FEF3C7',
  orangeTx: '#9A3412',
  orangeBd: '#FED7AA',
  orangeBg: '#FFEDD5',
  redTx:    '#991B1B',
  redBd:    '#FCA5A5',
  redBg:    '#FEE2E2',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PenScenario { depth: number; achievedResistance: number; converged: boolean }
interface LintScenario { length: number; achievedResistance: number }

export interface DiepteRapportProps {
  postcode?: string;
  electrodeType: 'pen' | 'lint';
  rho: number;
  groundwaterDepth: number;
  ph: number;
  targetResistance: number;
  rhoDry?: number;
  rhoWet?: number;
  gwGunstig?: number;
  gwGemiddeld?: number;
  gwOngunstig?: number;
  scenarios: {
    gunstig:   PenScenario | LintScenario;
    gemiddeld: PenScenario | LintScenario;
    ongunstig: PenScenario | LintScenario;
  };
  parallelAdvice?: {
    aantalPennen: number;
    minAfstand:   number;
    rParallel:    number;
    rSingle:      number;
  } | null;
  riskClass: { riskClass: string; label: string; color: string; description: string };
  corrosionClass: { label: string; color: string; lifetimeYears: string; advies: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dim(s: PenScenario | LintScenario): number {
  return 'depth' in s ? s.depth : s.length;
}

function fmtR(v: number) {
  return v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1);
}

function harmonicRho(rhoDry: number, rhoWet: number, gwDepth: number, L: number): number {
  if (gwDepth <= 0) return rhoWet;
  if (gwDepth >= L) return rhoDry;
  return L / (gwDepth / rhoDry + (L - gwDepth) / rhoWet);
}

function statusColors(color: string) {
  const m: Record<string, { bd: string; bg: string; tx: string }> = {
    green:  { bd: C.greenBd,  bg: C.greenBg,  tx: C.greenTx  },
    yellow: { bd: C.yellowBd, bg: C.yellowBg, tx: C.yellowTx },
    orange: { bd: C.orangeBd, bg: C.orangeBg, tx: C.orangeTx },
    red:    { bd: C.redBd,    bg: C.redBg,    tx: C.redTx    },
  };
  return m[color] ?? m.yellow;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 36,
    paddingTop: 30,
    paddingBottom: 44,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.dark,
  },
  // Header
  header: {
    backgroundColor: C.dark,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  hTitle: { color: C.orange, fontSize: 19, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  hSub:   { color: C.cream,  fontSize: 9.5 },
  hRight: { alignItems: 'flex-end' },
  hMeta:  { color: '#94A3B8', fontSize: 8, marginBottom: 2 },
  hBadge: {
    backgroundColor: C.orange, borderRadius: 3,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  hBadgeTx: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Section header
  secBox: {
    backgroundColor: C.bg,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    marginTop: 10,
  },
  secTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },

  // Two-column layout
  row2: { flexDirection: 'row', gap: 12 },
  col:  { flex: 1 },

  // Key-value rows
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  kvLabel: { flex: 1, color: C.gray, fontSize: 8 },
  kvValue: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8 },

  // Scenario cards
  scenRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  scen: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#FAFAFA',
  },
  scenActive: { borderColor: C.orange, backgroundColor: '#FFF7ED' },
  scenDim:    { opacity: 0.65 },
  scenLabel:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.gray, marginBottom: 1 },
  scenSub:    { fontSize: 7,   color: C.grayLt, marginBottom: 5 },
  scenDepth:  { fontSize: 22,  fontFamily: 'Helvetica-Bold', color: C.dark, lineHeight: 1 },
  scenUnit:   { fontSize: 8.5, color: C.gray },
  scenR:      { fontSize: 7.5, color: C.gray, marginTop: 3 },

  // Parallel advice
  parallelBox: {
    borderWidth: 1,
    borderColor: C.orangeBd,
    backgroundColor: C.orangeBg,
    borderRadius: 4,
    padding: 9,
    marginBottom: 10,
  },
  parallelTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.orangeTx, marginBottom: 5 },
  parallelGrid:  { flexDirection: 'row', gap: 12 },
  parallelItem:  { flex: 1 },
  parallelLbl:   { fontSize: 7.5, color: C.orangeTx, marginBottom: 1 },
  parallelVal:   { fontSize: 9,   fontFamily: 'Helvetica-Bold', color: C.dark },

  // Ra table
  raTableHdr: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.gray },
  raRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  td: { fontSize: 8 },

  // Status text
  txPass: { color: '#166534', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  txWarn: { color: '#92400E', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  txFail: { color: '#991B1B', fontFamily: 'Helvetica-Bold', fontSize: 8 },

  // Risk / corrosion cards
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
  },
  cardBadge: {
    fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4,
  },
  cardTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  cardSub:   { fontSize: 7.5, color: C.gray },
  cardDesc:  { fontSize: 8,   lineHeight: 1.4 },

  // Disclaimer
  disclaimerBox: {
    backgroundColor: C.yellowBg,
    borderWidth: 1,
    borderColor: C.yellowBd,
    borderRadius: 4,
    padding: 10,
    marginTop: 10,
  },
  dTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.yellowTx, marginBottom: 4 },
  dText:  { fontSize: 7.5, color: C.yellowTx, lineHeight: 1.6 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerTx: { fontSize: 7.5, color: '#94A3B8' },
});

// ─── Ra check data ────────────────────────────────────────────────────────────

const RA_CHECK = [
  { label: 'Aardlek 30–300 mA (TT)',  max: 166,    norm: 'NEN 1010'  },
  { label: 'Aardlek 500 mA (TT)',      max: 100,    norm: 'NEN 1010'  },
  { label: 'Bliksem',                  max: 10,     norm: 'NEN 62305' },
  { label: 'B10 — TT, geen aardlek',   max: 1.00,   norm: 'NEN 1010'  },
  { label: 'B16 — TT, geen aardlek',   max: 0.625,  norm: 'NEN 1010'  },
  { label: 'B25 — TT, geen aardlek',   max: 0.40,   norm: 'NEN 1010'  },
  { label: 'C16 — TT, geen aardlek',   max: 0.3125, norm: 'NEN 1010'  },
  { label: 'C20 — TT, geen aardlek',   max: 0.25,   norm: 'NEN 1010'  },
];

// ─── SVG: Soil cross-section ──────────────────────────────────────────────────

function CrossSectionSvg({ rodLength, gwDepth, numRods }: {
  rodLength: number; gwDepth: number; numRods: number;
}) {
  const W = 228, H = 128;
  const ml = 22, mt = 16, mr = 52, mb = 6;
  const dw = W - ml - mr, dh = H - mt - mb;
  const maxDepth = Math.max(rodLength * 1.2, gwDepth + 1, 4);
  const scY = dh / maxDepth;
  const gwY  = mt + Math.min(gwDepth,   maxDepth) * scY;
  const rodY = mt + Math.min(rodLength, maxDepth) * scY;

  const rodXs = Array.from({ length: numRods }, (_, i) =>
    ml + ((i + 1) * dw) / (numRods + 1),
  );

  const step = maxDepth <= 5 ? 1 : maxDepth <= 10 ? 2 : maxDepth <= 20 ? 4 : 5;
  const ticks = Array.from(
    { length: Math.floor(maxDepth / step) + 1 },
    (_, i) => i * step,
  );

  return (
    <Svg width={W} height={H}>
      {/* Zones */}
      <Rect x={ml} y={mt} width={dw} height={Math.max(0, gwY - mt)} fill={C.dry} fillOpacity={0.3} />
      <Rect x={ml} y={gwY} width={dw} height={Math.max(0, H - mb - gwY)} fill={C.wet} fillOpacity={0.4} />
      <Rect x={ml} y={mt} width={dw} height={dh} fill="none" stroke="#CBD5E1" strokeWidth={0.5} />

      {/* GWT dashed line */}
      <Line x1={ml} y1={gwY} x2={ml + dw} y2={gwY} stroke={C.gwLine} strokeWidth={1} strokeDasharray="5 3" />

      {/* GWT label */}
      <Text x={ml + dw + 3} y={gwY + 3} style={{ fontSize: 6.5, fill: C.gwLine }}>
        GHG {gwDepth.toFixed(1)}m
      </Text>

      {/* Depth ticks */}
      {ticks.map(d => (
        <G key={d}>
          <Line x1={ml - 3} y1={mt + d * scY} x2={ml} y2={mt + d * scY} stroke="#CBD5E1" strokeWidth={0.5} />
          <Text x={ml - 4} y={mt + d * scY + 2.5} style={{ fontSize: 6, fill: '#94A3B8' }}>
            {d}
          </Text>
        </G>
      ))}

      {/* maaiveld label */}
      <Text x={ml + 2} y={mt - 4} style={{ fontSize: 6.5, fill: '#94A3B8' }}>maaiveld (0 m)</Text>

      {/* Rods */}
      {rodXs.map((x, i) => (
        <G key={i}>
          <Line x1={x} y1={mt} x2={x} y2={rodY} stroke={C.orange} strokeWidth={2.5} strokeLinecap="round" />
          <Polygon points={`${x - 3},${rodY} ${x + 3},${rodY} ${x},${rodY + 5}`} fill={C.orange} />
        </G>
      ))}
    </Svg>
  );
}

// ─── SVG: R vs depth graph ────────────────────────────────────────────────────

function RvsDiepteSvg({ rhoDry, rhoWet, gwDepth, targetResistance, achievedDepth }: {
  rhoDry: number; rhoWet: number; gwDepth: number;
  targetResistance: number; achievedDepth: number;
}) {
  const W = 258, H = 128;
  const ml = 36, mt = 8, mr = 8, mb = 22;
  const dw = W - ml - mr, dh = H - mt - mb;

  const maxDepth = Math.max(achievedDepth * 1.35, 5);
  const d = 0.014;
  const steps = 50;

  const pts: { depth: number; R: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const L = 0.5 + (maxDepth - 0.5) * (i / steps);
    const rho = harmonicRho(rhoDry, rhoWet, gwDepth, L);
    const R = (rho / (2 * Math.PI * L)) * Math.log(4 * L / d);
    pts.push({ depth: L, R: Math.max(0, R) });
  }

  const maxR = Math.min(pts[0]?.R ?? 500, 500);

  const toX = (depth: number) => ml + (depth / maxDepth) * dw;
  const toY = (R: number)     => mt + (1 - Math.min(R, maxR) / maxR) * dh;

  // Build polyline points string
  const polyPts = pts.map(p => `${toX(p.depth).toFixed(1)},${toY(p.R).toFixed(1)}`).join(' ');

  const targetY  = toY(targetResistance);
  const achievedX = toX(achievedDepth);
  const achievedY = toY(targetResistance);

  // Y-axis ticks (4 evenly spaced)
  const rMax = Math.ceil(maxR / 50) * 50 || 100;
  const yTicks = [0, rMax * 0.25, rMax * 0.5, rMax * 0.75, rMax].map(v => Math.round(v));

  // X-axis ticks
  const xStep = maxDepth <= 6 ? 1 : maxDepth <= 12 ? 2 : maxDepth <= 20 ? 4 : 5;
  const xTicks = Array.from({ length: Math.floor(maxDepth / xStep) + 1 }, (_, i) => i * xStep);

  return (
    <Svg width={W} height={H}>
      {/* Grid */}
      {yTicks.map(v => (
        <Line key={v} x1={ml} y1={toY(v)} x2={ml + dw} y2={toY(v)} stroke="#F1F5F9" strokeWidth={1} />
      ))}

      {/* Resistance curve */}
      <Polygon points={polyPts} stroke={C.orange} strokeWidth={1.8} fill="none" />

      {/* Target line */}
      <Line x1={ml} y1={targetY} x2={ml + dw} y2={targetY} stroke="#64748B" strokeWidth={0.8} strokeDasharray="5 3" />
      <Text x={ml + dw - 2} y={targetY - 3} style={{ fontSize: 6.5, fill: '#64748B' }}>
        doel {targetResistance} Ω
      </Text>

      {/* Achieved depth marker */}
      <Line x1={achievedX} y1={mt} x2={achievedX} y2={mt + dh} stroke={C.orange} strokeWidth={0.8} strokeDasharray="3 3" />
      <Circle cx={achievedX} cy={achievedY} r={3.5} fill={C.orange} />
      <Text x={achievedX + 5} y={achievedY - 5} style={{ fontSize: 6.5, fill: C.orange }}>
        {achievedDepth.toFixed(1)}m
      </Text>

      {/* Y axis */}
      <Line x1={ml} y1={mt} x2={ml} y2={mt + dh} stroke="#CBD5E1" strokeWidth={0.75} />
      {yTicks.map(v => (
        <G key={v}>
          <Line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke="#CBD5E1" strokeWidth={0.5} />
          <Text x={ml - 4} y={toY(v) + 2.5} style={{ fontSize: 6, fill: '#94A3B8' }}>
            {v}
          </Text>
        </G>
      ))}
      <Text x={6} y={mt + dh / 2 + 8} style={{ fontSize: 6.5, fill: '#94A3B8' }}>R (Ω)</Text>

      {/* X axis */}
      <Line x1={ml} y1={mt + dh} x2={ml + dw} y2={mt + dh} stroke="#CBD5E1" strokeWidth={0.75} />
      {xTicks.map(v => (
        <G key={v}>
          <Line x1={toX(v)} y1={mt + dh} x2={toX(v)} y2={mt + dh + 3} stroke="#CBD5E1" strokeWidth={0.5} />
          <Text x={toX(v) - 4} y={mt + dh + 9} style={{ fontSize: 6, fill: '#94A3B8' }}>
            {v}m
          </Text>
        </G>
      ))}
    </Svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return (
    <View style={S.secBox}>
      <Text style={S.secTitle}>{children.toUpperCase()}</Text>
    </View>
  );
}

function KvRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[S.kvRow, alt ? { backgroundColor: C.bg } : {}]}>
      <Text style={S.kvLabel}>{label}</Text>
      <Text style={S.kvValue}>{value || '—'}</Text>
    </View>
  );
}

function RaCheckTable({ raGemiddeld, raOngunstig }: { raGemiddeld: number; raOngunstig: number }) {
  return (
    <View>
      <View style={S.raTableHdr}>
        <Text style={[S.th, { flex: 3 }]}>Beveiliging</Text>
        <Text style={[S.th, { flex: 1 }]}>Max Ra</Text>
        <Text style={[S.th, { flex: 1 }]}>Norm</Text>
        <Text style={[S.th, { flex: 1.5 }]}>Gemiddeld</Text>
        <Text style={[S.th, { flex: 1.5 }]}>Ongunstig</Text>
      </View>
      {RA_CHECK.map(({ label, max, norm }) => {
        const passG = raGemiddeld  <= max;
        const passO = raOngunstig  <= max;
        const status = passO ? 'pass' : passG ? 'cond' : 'fail';
        const txStyle = status === 'pass' ? S.txPass : status === 'cond' ? S.txWarn : S.txFail;
        return (
          <View key={label} style={[S.raRow, { backgroundColor: status === 'pass' ? '#F0FDF4' : status === 'cond' ? '#FFFBEB' : '#FEF2F2' }]}>
            <Text style={[S.td, { flex: 3 }]}>{label}</Text>
            <Text style={[S.td, { flex: 1, color: C.gray }]}>≤ {fmtR(max)} Ω</Text>
            <Text style={[S.td, { flex: 1, color: C.grayLt }]}>{norm}</Text>
            <Text style={[txStyle, { flex: 1.5 }]}>{passG ? '✓ ' + fmtR(raGemiddeld) + ' Ω' : '✗ ' + fmtR(raGemiddeld) + ' Ω'}</Text>
            <Text style={[txStyle, { flex: 1.5 }]}>{passO ? '✓ ' + fmtR(raOngunstig) + ' Ω' : '✗ ' + fmtR(raOngunstig) + ' Ω'}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiepteRapportTemplate({
  postcode,
  electrodeType,
  rho,
  groundwaterDepth,
  ph,
  targetResistance,
  rhoDry,
  rhoWet,
  gwGunstig,
  gwGemiddeld,
  gwOngunstig,
  scenarios,
  parallelAdvice,
  riskClass,
  corrosionClass,
}: DiepteRapportProps) {
  const date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const scenG  = scenarios.gunstig;
  const scenM  = scenarios.gemiddeld;
  const scenO  = scenarios.ongunstig;
  const dimUnit = electrodeType === 'lint' ? 'm lint' : 'm';

  // Pen-specific
  const isPen  = electrodeType === 'pen';
  const rodLen = isPen ? dim(scenM) : 0;
  const numRods  = parallelAdvice?.aantalPennen ?? 1;

  const rCol  = statusColors(riskClass.color);
  const cCol  = statusColors(corrosionClass.color);

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View>
            <Text style={S.hTitle}>EarthGND</Text>
            <Text style={S.hSub}>
              {electrodeType === 'pen' ? 'Pendiepte Calculator' : 'Lintlengte Calculator'} — Aardingsrapport
            </Text>
          </View>
          <View style={S.hRight}>
            <Text style={S.hMeta}>{date}</Text>
            {postcode && <Text style={[S.hMeta, { marginBottom: 3 }]}>Locatie: {postcode}</Text>}
            <View style={S.hBadge}>
              <Text style={S.hBadgeTx}>INDICATIEF RAPPORT</Text>
            </View>
          </View>
        </View>

        {/* ── Invoergegevens + Tweelaags model ── */}
        <View style={S.row2}>
          <View style={S.col}>
            <SectionHeader>Invoergegevens</SectionHeader>
            {postcode   && <KvRow label="Locatie (postcode)"   value={postcode} />}
            <KvRow label="Elektrodetype"           value={electrodeType === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint'} alt />
            <KvRow label="Bodemweerstand ρ"        value={`${rho} Ω·m`} />
            <KvRow label="GHG grondwaterstand"     value={`${groundwaterDepth} m onder maaiveld`} alt />
            <KvRow label="Bodem pH"                value={String(ph)} />
            <KvRow label="Doelweerstand Ra"        value={`≤ ${targetResistance} Ω`} alt />
          </View>
          <View style={S.col}>
            <SectionHeader>2-laags bodemmodel</SectionHeader>
            {rhoDry != null && <KvRow label="Droge zone (boven GHG)"   value={`ρ ≈ ${rhoDry} Ω·m`} />}
            {rhoWet != null && <KvRow label="Verzadigde zone (onder GHG)" value={`ρ ≈ ${rhoWet} Ω·m`} alt />}
            {gwGunstig   != null && <KvRow label="GWT — gunstig (GHG)"   value={`${gwGunstig.toFixed(2)} m`} />}
            {gwGemiddeld != null && <KvRow label="GWT — gemiddeld (+1,5 m)" value={`${gwGemiddeld.toFixed(2)} m`} alt />}
            {gwOngunstig != null && <KvRow label="GWT — ongunstig (+3,0 m)" value={`${gwOngunstig.toFixed(2)} m`} />}
            <KvRow label="Combinatiemethode ρ"    value="Harmonisch gemiddelde (parallelle conductanties)" alt />
          </View>
        </View>

        {/* ── Drie scenario's ── */}
        <SectionHeader>Drie seizoensscenario&apos;s</SectionHeader>
        <View style={S.scenRow}>
          {([
            { key: 'gunstig',   s: scenG, gw: gwGunstig,   lbl: "Gunstig",   sub: "Natte periode — GHG",      active: false, dimmed: false },
            { key: 'gemiddeld', s: scenM, gw: gwGemiddeld, lbl: "Gemiddeld", sub: "Gemiddeld jaar (+1,5 m)",   active: true,  dimmed: false },
            { key: 'ongunstig', s: scenO, gw: gwOngunstig, lbl: "Ongunstig", sub: "Droge zomer (+3,0 m)",      active: false, dimmed: true  },
          ] as const).map(({ key, s, gw, lbl, sub, active, dimmed }) => (
            <View key={key} style={[S.scen, active ? S.scenActive : {}, dimmed ? S.scenDim : {}]}>
              <Text style={S.scenLabel}>{lbl}</Text>
              <Text style={S.scenSub}>
                GWT {gw != null ? gw.toFixed(1) : '—'} m  ·  {sub}
              </Text>
              <Text style={S.scenDepth}>
                {dim(s).toFixed(2)}<Text style={S.scenUnit}> {dimUnit}</Text>
              </Text>
              <Text style={S.scenR}>{s.achievedResistance.toFixed(2)} Ω berekend</Text>
              {'converged' in s && !s.converged && (
                <Text style={{ fontSize: 7, color: C.redTx, marginTop: 3 }}>⚠ Niet converged &gt;100 m</Text>
              )}
            </View>
          ))}
        </View>

        {/* ── Cross-section + R-vs-depth side by side ── */}
        {isPen && rhoDry != null && rhoWet != null && (
          <>
            <SectionHeader>Grondprofiel &amp; weerstand vs. diepte (gemiddeld scenario)</SectionHeader>
            <View style={[S.row2, { marginBottom: 10, alignItems: 'flex-start' }]}>
              {/* Cross-section */}
              <View>
                <Text style={{ fontSize: 7.5, color: C.gray, marginBottom: 4, fontFamily: 'Helvetica-Bold' }}>
                  Dwars&shy;doorsnede aarding
                </Text>
                <CrossSectionSvg
                  rodLength={rodLen}
                  gwDepth={gwGemiddeld ?? groundwaterDepth + 1.5}
                  numRods={numRods}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 10, height: 6, backgroundColor: C.dry, opacity: 0.45 }} />
                    <Text style={{ fontSize: 6.5, color: C.gray }}>Droog — {rhoDry} Ω·m</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 10, height: 6, backgroundColor: C.wet, opacity: 0.6 }} />
                    <Text style={{ fontSize: 6.5, color: C.gray }}>Verzadigd — {rhoWet} Ω·m</Text>
                  </View>
                </View>
              </View>

              {/* R-vs-depth graph */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 7.5, color: C.gray, marginBottom: 4, fontFamily: 'Helvetica-Bold' }}>
                  Weerstand vs. diepte
                </Text>
                <RvsDiepteSvg
                  rhoDry={rhoDry}
                  rhoWet={rhoWet}
                  gwDepth={gwGemiddeld ?? groundwaterDepth + 1.5}
                  targetResistance={targetResistance}
                  achievedDepth={dim(scenM)}
                />
                <Text style={{ fontSize: 6.5, color: C.grayLt, marginTop: 3, lineHeight: 1.4 }}>
                  Berekend met Dwight-formule en harmonisch ρ-gemiddelde.
                  Oranje stip = gemiddeld scenario doel bereikt.
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── Parallelschakeling ── */}
        {parallelAdvice && (
          <>
            <SectionHeader>Parallelschakeling aanbevolen</SectionHeader>
            <View style={S.parallelBox}>
              <Text style={S.parallelTitle}>
                {parallelAdvice.aantalPennen} pennen parallel — diepte per pen: {dim(scenM).toFixed(2)} m
              </Text>
              <View style={S.parallelGrid}>
                <View style={S.parallelItem}>
                  <Text style={S.parallelLbl}>Min. onderlinge afstand</Text>
                  <Text style={S.parallelVal}>{parallelAdvice.minAfstand} m</Text>
                </View>
                <View style={S.parallelItem}>
                  <Text style={S.parallelLbl}>Ra enkelvoudig</Text>
                  <Text style={S.parallelVal}>{parallelAdvice.rSingle} Ω</Text>
                </View>
                <View style={S.parallelItem}>
                  <Text style={S.parallelLbl}>Ra parallel (incl. koppeling)</Text>
                  <Text style={[S.parallelVal, { color: C.orange }]}>{parallelAdvice.rParallel} Ω</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Ra-haalbaarheidscheck ── */}
        <SectionHeader>Ra-haalbaarheidscheck</SectionHeader>
        <RaCheckTable
          raGemiddeld={(scenM as PenScenario).achievedResistance}
          raOngunstig={(scenO as PenScenario).achievedResistance}
        />

        {/* ── Risicoklasse + Corrosie ── */}
        <SectionHeader>Beoordeling</SectionHeader>
        <View style={S.cardRow}>
          <View style={[S.card, { borderColor: rCol.bd, backgroundColor: rCol.bg }]}>
            <Text style={[S.cardBadge, { color: rCol.tx }]}>{riskClass.riskClass}</Text>
            <Text style={[S.cardTitle, { color: rCol.tx }]}>{riskClass.label}</Text>
            <Text style={[S.cardDesc, { color: rCol.tx }]}>{riskClass.description}</Text>
          </View>
          <View style={[S.card, { borderColor: cCol.bd, backgroundColor: cCol.bg }]}>
            <Text style={[S.cardTitle, { color: cCol.tx, marginBottom: 1 }]}>Corrosieclassificatie</Text>
            <Text style={[S.cardTitle, { color: cCol.tx }]}>{corrosionClass.label}</Text>
            <Text style={[S.cardSub, { color: cCol.tx, marginBottom: 3 }]}>{corrosionClass.lifetimeYears}</Text>
            <Text style={[S.cardDesc, { color: cCol.tx }]}>{corrosionClass.advies}</Text>
          </View>
        </View>

        {/* ── Methodiek & Disclaimer ── */}
        <View style={S.disclaimerBox}>
          <Text style={S.dTitle}>Methodiek &amp; Disclaimers</Text>
          <Text style={S.dText}>
            Berekening met 2-laags bodemmodel (Dwight-formule). Droge zone boven GHG met ρ ≈ {rhoDry ?? '—'} Ω·m,
            verzadigde zone onder GHG met ρ ≈ {rhoWet ?? '—'} Ω·m. Laagweerstand gecombineerd met
            harmonisch gemiddelde (parallelle segment-conductanties): ρ_eff = Σ(ΔL) / Σ(ΔL/ρ).{'\n'}
            Seizoensscenario&apos;s: natte periode = GHG, gemiddeld = GHG + 1,5 m, ongunstig = GHG + 3,0 m.{'\n'}
            {'\n'}
            Normerend kader: NEN 1010 (elektrotechnische installaties), NEN 62305 (bliksembeveiliging),
            NEN 50522 (utiliteitsbouw), NEN 3140 (bedrijfsvoering laagspanning).{'\n'}
            {'\n'}
            ⚠ Dit rapport is indicatief en gebaseerd op desktopmodellering met BRO-bodemgegevens.
            Lokale bodemcondities kunnen afwijken van de gebruikte data. Meet altijd ter plaatse
            na installatie conform NEN 3140. EarthGND aanvaardt geen aansprakelijkheid voor resultaten
            van professioneel gebruik zonder veldverificatie door een gekwalificeerde installateur.
          </Text>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerTx}>EarthGND — Pendiepte Calculator · earthgnd.com</Text>
          <Text style={S.footerTx}>Gegenereerd: {date} — Indicatief, niet normatief</Text>
        </View>

      </Page>
    </Document>
  );
}
