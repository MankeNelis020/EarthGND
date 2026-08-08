import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { KLIC_DISABLE_ACK_VERSION } from '@/lib/work-preparation/klic-policy';

export const runtime = 'nodejs';

const schema = z.object({
  enabled: z.boolean(),
  acknowledgement: z.boolean().optional(),
});

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data } = await supabase
    .from('profiles')
    .select(
      'klic_readiness_check_enabled, klic_check_disabled_at, klic_check_disable_acknowledgement_version',
    )
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: (data as { klic_readiness_check_enabled?: boolean } | null)
      ?.klic_readiness_check_enabled ?? true,
    disabledAt: (data as { klic_check_disabled_at?: string | null } | null)
      ?.klic_check_disabled_at ?? null,
    acknowledgementVersion: KLIC_DISABLE_ACK_VERSION,
  });
}

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 });
  }

  if (body.enabled === false) {
    if (body.acknowledgement !== true) {
      return NextResponse.json(
        { error: 'Bevestiging is vereist om KLIC-controle uit te schakelen' },
        { status: 400 },
      );
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        klic_readiness_check_enabled: false,
        klic_check_disabled_at: new Date().toISOString(),
        klic_check_disabled_by: user.id,
        klic_check_disable_acknowledgement_version: KLIC_DISABLE_ACK_VERSION,
      })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, enabled: false });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      klic_readiness_check_enabled: true,
      klic_check_disabled_at: null,
      klic_check_disabled_by: null,
      klic_check_disable_acknowledgement_version: null,
    })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: true });
}
