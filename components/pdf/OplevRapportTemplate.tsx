'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { InspectionReport, Meting, Bevinding } from '@/lib/types/rapport';
import { NORM_PARAMS } from '@/lib/rapport-config';

const C = {
  dark:   '#1C1917',
  orange: '#E8761A',
  cream:  '#F5EFE6',
  gray:   '#666666',
  light:  '#f5f5f5',
  border: '#e0e0e0',
  pass:   '#166534',
  fail:   '#991b1b',
  passBg: '#dcfce7',
  failBg: '#fee2e2',
  nvt:    '#6b7280',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 40,
    paddingTop: 36,
    paddingBottom: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.dark,
  },
  header: {
    backgroundColor: C.dark,
    padding: 18,
    marginBottom: 20,
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: {},
  headerTitle: { color: C.orange, fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerSub: { color: C.cream, fontSize: 10 },
  headerRight: { alignItems: 'flex-end' },
  headerMeta: { color: C.cream, fontSize: 9 },
  statusBadge: {
    backgroundColor: C.orange,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  statusText: { color: '#fff', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  disclaimerBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 3,
    padding: 8,
    marginBottom: 14,
  },
  disclaimerText: { color: '#92400e', fontSize: 8.5, lineHeight: 1.4 },
  section: { marginBottom: 16 },
  sectionHeader: {
    backgroundColor: C.dark,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    borderRadius: 2,
  },
  sectionTitle: { color: C.orange, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  sectionSubtitle: { color: C.cream, fontSize: 8, marginTop: 1 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    minHeight: 20,
  },
  rowAlt: { backgroundColor: '#fafafa' },
  label: { width: '38%', color: C.gray, fontSize: 9 },
  value: { width: '62%', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  scanBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  scanLabel: { color: '#1e40af', fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  scanRow: { flexDirection: 'row', marginBottom: 2 },
  scanKey: { color: '#3b82f6', fontSize: 8, width: '45%' },
  scanVal: { color: '#1e3a8a', fontSize: 8, fontFamily: 'Helvetica-Bold', width: '55%' },
  table: { marginTop: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gray },
  td: { fontSize: 8.5 },
  colMeting: { width: '25%' },
  colWaarde: { width: '14%' },
  colToets: { width: '14%' },
  colMethode: { width: '22%' },
  colResultaat: { width: '12%' },
  colNotes: { width: '13%' },
  passCell: {
    backgroundColor: C.passBg,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  failCell: {
    backgroundColor: C.failBg,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  passText: { color: C.pass, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  failText: { color: C.fail, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  nvtText: { color: C.nvt, fontSize: 8 },
  bevindingRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 5,
    gap: 8,
  },
  prioriteitA: { color: '#991b1b', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  prioriteitB: { color: '#92400e', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  prioriteitC: { color: '#166534', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  signature: {
    marginTop: 16,
    borderTopWidth: 1.5,
    borderTopColor: C.orange,
    paddingTop: 10,
  },
  sigTitle: { color: C.dark, fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  sigConformiteitBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  sigConformiteitText: { color: '#166534', fontSize: 8.5, lineHeight: 1.5 },
  sigRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  sigLabel: { color: C.gray, fontSize: 9, width: '30%' },
  sigValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', width: '70%' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: '#aaa' },
  footerDisclaimer: {
    fontSize: 7.5,
    color: '#bbb',
    textAlign: 'center',
    marginTop: 2,
  },
  pageNum: { fontSize: 8, color: '#aaa' },
});

function Row({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[styles.row, alt ? styles.rowAlt : {}]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

function PassFailBadge({ value }: { value?: string | null }) {
  if (value === 'pass') return <View style={styles.passCell}><Text style={styles.passText}>VOLDOET</Text></View>;
  if (value === 'fail') return <View style={styles.failCell}><Text style={styles.failText}>AFWIJKING</Text></View>;
  return <Text style={styles.nvtText}>n.v.t.</Text>;
}

function ScanContextBox({ ctx }: { ctx: Record<string, unknown> }) {
  if (!ctx || Object.keys(ctx).length === 0) return null;
  const rows: [string, string][] = ([
    ctx.rho          !== undefined ? ['Bodemweerstand ρ', `${ctx.rho} Ω·m`]          : null,
    ctx.voorspeld_diepte_m !== undefined ? ['Indicatieve richtdiepte', `${ctx.voorspeld_diepte_m} m`] : null,
    ctx.voorspeld_ra_ohm  !== undefined ? ['Indicatieve Ra', `${ctx.voorspeld_ra_ohm} Ω`]         : null,
    ctx.grondwaterstand_m !== undefined ? ['Grondwaterstand (GHG)', `${ctx.grondwaterstand_m} m`]  : null,
    ctx.risicoklasse !== undefined ? ['Risicoklasse', String(ctx.risicoklasse)] : null,
  ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null);
  return (
    <View style={styles.scanBox}>
      <Text style={styles.scanLabel}>Scan-context (indicatief, o.b.v. BRO-bodemdata, postcodeniveau — lokale bodem kan afwijken)</Text>
      {rows.map(([k, v], i) => (
        <View key={i} style={styles.scanRow}>
          <Text style={styles.scanKey}>{k}</Text>
          <Text style={styles.scanVal}>{v}</Text>
        </View>
      ))}
      {!!ctx.databron && <Text style={{ ...styles.scanKey, marginTop: 3 }}>Bron: {String(ctx.databron)}</Text>}
    </View>
  );
}

export interface OplevRapportTemplateProps {
  report: InspectionReport;
  metingen: Meting[];
}

export function OplevRapportTemplate({ report, metingen }: OplevRapportTemplateProps) {
  const datum = report.datum_uitvoering
    ? new Date(report.datum_uitvoering).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const ondertekendOp = report.conformiteit_datum
    ? new Date(report.conformiteit_datum).toLocaleString('nl-NL')
    : null;
  const bevindingen = (report.bevindingen ?? []) as Bevinding[];

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>EarthGND</Text>
            <Text style={styles.headerSub}>Aarding Opleverrapport — NEN 1010 deel 6</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerMeta}>{datum}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {report.status === 'ondertekend' ? 'ONDERTEKEND' : 'CONCEPT'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Disclaimer ── */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            EarthGND levert een digitale werkomgeving en rekenhulp. De conformiteitsverklaring is de
            uitsluitende verklaring van de ondertekenende installateur op basis van diens eigen metingen.
            EarthGND aanvaardt geen aansprakelijkheid voor de juistheid van de ingevoerde meetwaarden of
            voor normconformiteit. Scan-context: indicatief, gebaseerd op BRO-bodemdata (postcodeniveau).
          </Text>
        </View>

        {/* ── Deel 1: Algemene gegevens ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deel 1 — Algemene gegevens</Text>
            <Text style={styles.sectionSubtitle}>Beschrijving van de installatie</Text>
          </View>

          <Row label="Opdrachtgever"    value={report.opdrachtgever ?? ''} />
          <Row label="Locatie / adres"  value={report.locatie ?? ''} alt />
          <Row label="Soort installatie" value={report.soort_installatie ?? ''} />
          <Row label="Aard werkzaamheden" value={report.aard_werkzaamheden ?? ''} alt />
          <Row label="Netwerkstelsel"   value={report.systeemtype ?? ''} />
          <Row label="Elektrode type"   value={report.elektrode_type ?? ''} alt />
          <Row label="Elektrode materiaal" value={report.elektrode_materiaal ?? ''} />
          <Row label="Installatied iepte" value={report.elektrode_diepte_m != null ? `${report.elektrode_diepte_m} m` : ''} alt />
          <Row label="Aantal elektroden" value={String(report.elektrode_aantal ?? 1)} />
          <Row label="Datum uitvoering" value={datum} alt />
          <Row label="Uitvoerder"       value={report.uitvoerder_naam ?? ''} />
          <Row label="Erkenning nr."    value={report.uitvoerder_erkenning ?? ''} alt />
        </View>

        {/* Scan context */}
        {report.scan_context && Object.keys(report.scan_context).length > 0 && (
          <ScanContextBox ctx={report.scan_context as Record<string, unknown>} />
        )}

        {/* ── Deel 2: Meetwaarden ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deel 2 — Meetwaarden</Text>
            <Text style={styles.sectionSubtitle}>
              Pass/fail vastgesteld door de installateur op basis van de toegepaste toetswaarden.
              EarthGND oordeelt niet over normconformiteit.
            </Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colMeting]}>Meting</Text>
              <Text style={[styles.th, styles.colWaarde]}>Waarde</Text>
              <Text style={[styles.th, styles.colToets]}>Toetswaarde</Text>
              <Text style={[styles.th, styles.colMethode]}>Meetmethode</Text>
              <Text style={[styles.th, styles.colResultaat]}>Resultaat</Text>
              <Text style={[styles.th, styles.colNotes]}>Notities</Text>
            </View>

            {metingen.map((m, i) => {
              const param = NORM_PARAMS[m.type];
              return (
                <View key={i} style={[styles.row, i % 2 === 1 ? styles.rowAlt : {}]}>
                  <Text style={[styles.td, styles.colMeting]}>{param?.label ?? m.type}</Text>
                  <Text style={[styles.td, styles.colWaarde]}>
                    {m.waarde != null ? `${m.waarde} ${m.eenheid}` : '—'}
                  </Text>
                  <Text style={[styles.td, styles.colToets]}>
                    {m.toetswaarde != null ? `${m.toetswaarde} ${m.eenheid}` : '—'}
                  </Text>
                  <Text style={[styles.td, styles.colMethode]}>{m.meetmethode ?? '—'}</Text>
                  <View style={styles.colResultaat}>
                    <PassFailBadge value={m.pass_fail} />
                  </View>
                  <Text style={[styles.td, styles.colNotes]}>{m.notities ?? ''}</Text>
                </View>
              );
            })}

            {metingen.length === 0 && (
              <View style={styles.row}>
                <Text style={{ ...styles.td, color: C.gray }}>Geen metingen ingevoerd</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Deel 3: Bevindingen & Conclusie ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deel 3 — Bevindingen &amp; conclusie</Text>
          </View>

          {bevindingen.length > 0 ? (
            <>
              {bevindingen.map((b, i) => (
                <View key={i} style={styles.bevindingRow}>
                  <Text style={{ fontSize: 9, color: C.gray, width: 20 }}>{b.nummer}.</Text>
                  <Text style={
                    b.prioriteit === 'A' ? styles.prioriteitA :
                    b.prioriteit === 'B' ? styles.prioriteitB : styles.prioriteitC
                  }>
                    [{b.prioriteit}]
                  </Text>
                  <Text style={{ fontSize: 9, flex: 1 }}>{b.omschrijving}</Text>
                </View>
              ))}
              <View style={{ marginTop: 6, marginBottom: 2 }}>
                <Text style={{ fontSize: 8, color: C.gray }}>
                  Prioriteit A = direct herstellen · B = binnen afgesproken termijn · C = aanbeveling
                </Text>
              </View>
            </>
          ) : (
            <Row label="Bevindingen" value="Geen tekortkomingen geconstateerd" />
          )}

          {report.eindconclusie ? (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: C.light, borderRadius: 3 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Eindconclusie</Text>
              <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{report.eindconclusie}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Conformiteitsverklaring + handtekening ── */}
        {report.status === 'ondertekend' && (
          <View style={styles.signature}>
            <Text style={styles.sigTitle}>Conformiteitsverklaring &amp; ondertekening</Text>
            <View style={styles.sigConformiteitBox}>
              <Text style={styles.sigConformiteitText}>
                Ondergetekende verklaart dat de aardingsinstallatie is aangelegd en geïnspecteerd
                conform NEN 1010 deel 6 en dat de hierboven opgenomen meetwaarden naar waarheid zijn
                vastgesteld. De verantwoordelijkheid voor juistheid en normconformiteit berust bij
                de ondertekenaar.
              </Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Naam installateur</Text>
              <Text style={styles.sigValue}>{report.conformiteit_naam ?? '—'}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Erkenning nr.</Text>
              <Text style={styles.sigValue}>{report.conformiteit_erkenning ?? '—'}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Ondertekend op</Text>
              <Text style={styles.sigValue}>{ondertekendOp ?? '—'}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Handtekening</Text>
              <Text style={{ ...styles.sigValue, fontFamily: 'Helvetica', fontStyle: 'italic', color: C.gray }}>
                Digitaal akkoord gegeven in EarthGND op {ondertekendOp}
              </Text>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>EarthGND — Aarding Opleverrapport</Text>
          <Text style={styles.footerText}>
            Gegenereerd: {new Date().toLocaleDateString('nl-NL')} · earthgnd.nl
          </Text>
        </View>

      </Page>
    </Document>
  );
}
