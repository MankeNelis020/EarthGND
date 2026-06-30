/**
 * Shared logic: pendiepte calculation + veldmeting → NEN 1010 inspection report prefill.
 */

import type { ScanContext, PassFail } from '@/lib/types/rapport';
import { getScanContext } from '@/lib/scan-context';
import { toetsMeting } from '@/lib/rapport-config';

export interface PendiepteCalcRow {
  id: string;
  postcode: string | null;
  rapport_naam: string | null;
  input_values?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  risicoklasse?: string | null;
  created_at?: string | null;
}

export interface PendiepteMetingRow {
  id: string;
  calculation_id: string;
  status: string;
  postcode: string | null;
  straatnaam: string | null;
  huisnummer: string | null;
  woonplaats: string | null;
  achieved_ra: number | null;
  installed_depth: number | null;
  electrode_type: string | null;
  aantal_pennen: number | null;
  rods: { rod_number: number }[] | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
}

export interface LinkableVeldmeting {
  calculation_id: string;
  rapport_naam: string | null;
  postcode: string | null;
  locatie_label: string;
  status: string;
  status_label: string;
  created_at: string;
  updated_at: string;
  role: 'calculator' | 'installateur';
  short_id: string;
}

const STATUS_LABELS: Record<string, string> = {
  geen_meting: 'Geen veldmeting',
  draft:       'Concept',
  invited:     'Uitgenodigd',
  submitted:   'Ingediend',
  confirmed:   'Bevestigd',
};

export function metingStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatLocatieLabel(calc: Pick<PendiepteCalcRow, 'postcode' | 'rapport_naam'>, meting: Pick<PendiepteMetingRow, 'straatnaam' | 'huisnummer' | 'postcode' | 'woonplaats'> | null): string {
  if (meting?.straatnaam) {
    return [meting.straatnaam, meting.huisnummer, meting.postcode, meting.woonplaats].filter(Boolean).join(' ');
  }
  if (calc.rapport_naam?.trim()) return calc.rapport_naam.trim();
  return calc.postcode ?? 'Locatie onbekend';
}

export function buildEnrichedScanContext(calc: PendiepteCalcRow, meting: PendiepteMetingRow | null): ScanContext {
  const base = getScanContext(calc as unknown as Record<string, unknown>);
  if (!meting) return base;

  return {
    ...base,
    gemeten_ra_ohm:     meting.achieved_ra ?? undefined,
    gemeten_diepte_m:   meting.installed_depth ?? undefined,
    veldmeting_status:  meting.status,
    veldmeting_op:      meting.confirmed_at ?? meting.submitted_at ?? undefined,
    databron:           meting.status === 'confirmed'
      ? 'Pendiepte berekening + bevestigde veldmeting (EarthGND)'
      : 'Pendiepte berekening + veldmeting (EarthGND)',
  };
}

export function mapElectrodeType(metingType: string | null): string | null {
  if (metingType === 'pen' || metingType === 'lint') return metingType;
  return metingType;
}

export function resolveElektrodeAantal(meting: PendiepteMetingRow): number {
  if (meting.aantal_pennen && meting.aantal_pennen > 0) return meting.aantal_pennen;
  if (meting.rods?.length) return meting.rods.length;
  return 1;
}

export function resolveDatumUitvoering(meting: PendiepteMetingRow): string | null {
  const raw = meting.confirmed_at ?? meting.submitted_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

export function buildRaMeting(
  meting: PendiepteMetingRow,
  calc: PendiepteCalcRow,
): { waarde: number; toetswaarde: number | null; pass_fail: PassFail } | null {
  if (meting.achieved_ra == null) return null;
  const input = (calc.input_values ?? {}) as Record<string, unknown>;
  const target = typeof input.targetResistance === 'number' ? input.targetResistance : null;
  const pass_fail = target != null
    ? toetsMeting('ra', meting.achieved_ra, target)
    : 'nvt';
  return {
    waarde: meting.achieved_ra,
    toetswaarde: target,
    pass_fail,
  };
}

export function canCreateNenReport(metingStatus: string | null): { ok: boolean; reason?: string } {
  if (!metingStatus) return { ok: false, reason: 'Koppel eerst een veldmeting.' };
  if (metingStatus === 'confirmed') return { ok: true };
  if (metingStatus === 'submitted') return { ok: false, reason: 'Bevestig eerst de veldmeting voordat u een NEN 1010-rapport maakt.' };
  if (metingStatus === 'invited') return { ok: false, reason: 'Wacht tot de installateur de veldmeting heeft ingediend.' };
  return { ok: false, reason: 'Veldmeting is nog niet gereed.' };
}
