import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { canUseFeature } from '@/lib/entitlements';
import { sanitizeIntegration } from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const [{ data: profile }, { data: integration }] = await Promise.all([
    supabase
      .from('profiles')
      .select('plan, company_name, klic_readiness_check_enabled')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('klic_integrations')
      .select('status, provider, provider_account_reference, last_verified_at, last_error_code')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const plan = (profile as { plan?: string } | null)?.plan ?? 'gratis';

  return NextResponse.json({
    entitled: canUseFeature(plan, 'klic_api_integration'),
    readinessEnabled: (profile as { klic_readiness_check_enabled?: boolean } | null)
      ?.klic_readiness_check_enabled ?? true,
    companyName: (profile as { company_name?: string | null } | null)?.company_name ?? null,
    integration: sanitizeIntegration(integration as Record<string, unknown> | null),
    bmklEnabled: process.env.KLIC_BMKL_ENABLED === 'true',
    providerMode: process.env.KLIC_PROVIDER_MODE ?? 'manual',
  });
}

/** Disconnect — revoke credentials reference; keep historic klic_requests. */
export async function DELETE() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { error } = await supabase
    .from('klic_integrations')
    .update({
      status: 'disconnected',
      encrypted_credentials_reference: null,
      provider_account_reference: null,
      last_error_code: null,
      last_verified_at: null,
    })
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, integration: sanitizeIntegration(null) });
}
