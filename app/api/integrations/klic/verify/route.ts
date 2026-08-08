import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { canUseFeature } from '@/lib/entitlements';
import { createKlicProvider } from '@/lib/klic/provider';
import type { KlicProviderId } from '@/lib/klic/types';
import { sanitizeIntegration } from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (!canUseFeature((profile as { plan?: string } | null)?.plan, 'klic_api_integration')) {
    return NextResponse.json(
      { error: 'Niet beschikbaar op dit plan', code: 'FEATURE_NOT_ENTITLED' },
      { status: 402 },
    );
  }

  const { data: integration } = await supabase
    .from('klic_integrations')
    .select('provider, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: 'Niet gekoppeld' }, { status: 404 });
  }

  const provider = createKlicProvider(
    ((integration as { provider?: string }).provider as KlicProviderId) ?? 'manual',
  );
  const result = await provider.validateConnection();

  const nextStatus = result.ok
    ? 'connected'
    : result.status === 'configuration_required'
      ? 'configuration_required'
      : 'connection_error';

  const { data: updated, error } = await supabase
    .from('klic_integrations')
    .update({
      status: nextStatus,
      provider_account_reference:
        result.accountReference ??
        (integration as { provider_account_reference?: string }).provider_account_reference,
      last_verified_at: result.ok ? new Date().toISOString() : null,
      last_error_code: result.errorCode ?? null,
    })
    .eq('user_id', user.id)
    .select('status, provider, provider_account_reference, last_verified_at, last_error_code')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: result.ok,
    integration: sanitizeIntegration(updated as Record<string, unknown>),
    messageSafe: result.messageSafe,
  });
}
