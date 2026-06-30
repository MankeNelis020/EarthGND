import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  formatLocatieLabel,
  metingStatusLabel,
  type LinkableVeldmeting,
} from '@/lib/pendiepte-rapport-bridge';

export const runtime = 'nodejs';

/** List veldmetingen the user can open as pendiepte opleverrapport. */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const email = user.email?.toLowerCase() ?? '';
  const itemsMap = new Map<string, LinkableVeldmeting>();

  const { data: ownCalcs } = await supabase
    .from('calculations')
    .select('id, postcode, rapport_naam, created_at')
    .eq('user_id', user.id)
    .eq('tool', 'diepte')
    .order('created_at', { ascending: false })
    .limit(50);

  for (const calc of ownCalcs ?? []) {
    itemsMap.set(calc.id, {
      calculation_id: calc.id,
      rapport_naam:   calc.rapport_naam,
      postcode:       calc.postcode,
      locatie_label:  formatLocatieLabel(calc, null),
      status:         'geen_meting',
      status_label:   metingStatusLabel('geen_meting'),
      created_at:     calc.created_at,
      updated_at:     calc.created_at,
      role:           'calculator',
      short_id:       calc.id.slice(0, 8),
    });
  }

  let monteurQuery = supabase
    .from('pendiepte_metingen')
    .select('calculation_id, status, postcode, straatnaam, huisnummer, woonplaats, submitted_at, confirmed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  monteurQuery = email
    ? monteurQuery.or(`monteur_user_id.eq.${user.id},monteur_email.ilike.${email}`)
    : monteurQuery.eq('monteur_user_id', user.id);

  const { data: monteurMetingen } = await monteurQuery;

  const extraCalcIds = (monteurMetingen ?? [])
    .map(m => m.calculation_id)
    .filter(id => !itemsMap.has(id));

  let extraCalcs: { id: string; postcode: string | null; rapport_naam: string | null; created_at: string }[] = [];
  if (extraCalcIds.length) {
    const { data } = await supabase
      .from('calculations')
      .select('id, postcode, rapport_naam, created_at')
      .in('id', extraCalcIds);
    extraCalcs = data ?? [];
  }

  const calcById = new Map([
    ...(ownCalcs ?? []).map(c => [c.id, c] as const),
    ...extraCalcs.map(c => [c.id, c] as const),
  ]);

  for (const meting of monteurMetingen ?? []) {
    const calc = calcById.get(meting.calculation_id);
    if (!calc) continue;

    const updatedAt = meting.confirmed_at ?? meting.submitted_at ?? calc.created_at;
    const existing = itemsMap.get(meting.calculation_id);

    itemsMap.set(meting.calculation_id, {
      calculation_id: meting.calculation_id,
      rapport_naam:   calc.rapport_naam,
      postcode:       calc.postcode,
      locatie_label:  formatLocatieLabel(calc, meting),
      status:         meting.status,
      status_label:   metingStatusLabel(meting.status),
      created_at:     calc.created_at,
      updated_at:     updatedAt,
      role:           existing ? 'calculator' : 'installateur',
      short_id:       meting.calculation_id.slice(0, 8),
    });
  }

  const ownerOnlyIds = Array.from(itemsMap.keys()).filter(id => itemsMap.get(id)!.status === 'geen_meting');
  if (ownerOnlyIds.length) {
    const { data: metingen } = await supabase
      .from('pendiepte_metingen')
      .select('calculation_id, status, postcode, straatnaam, huisnummer, woonplaats, submitted_at, confirmed_at')
      .in('calculation_id', ownerOnlyIds);

    for (const meting of metingen ?? []) {
      const calc = calcById.get(meting.calculation_id);
      const item = itemsMap.get(meting.calculation_id);
      if (!calc || !item) continue;
      itemsMap.set(meting.calculation_id, {
        ...item,
        locatie_label: formatLocatieLabel(calc, meting),
        status:        meting.status,
        status_label:  metingStatusLabel(meting.status),
        updated_at:    meting.confirmed_at ?? meting.submitted_at ?? item.updated_at,
      });
    }
  }

  const items = Array.from(itemsMap.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return NextResponse.json({ items });
}
