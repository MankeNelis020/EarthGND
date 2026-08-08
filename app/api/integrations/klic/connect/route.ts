import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { canUseFeature } from '@/lib/entitlements';
import { sanitizeIntegration } from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

const schema = z.object({
  /** Opaque account label only — never a secret. */
  accountReference: z.string().trim().min(2).max(120).optional(),
  /**
   * Optional opaque vault key reference for future secret backends.
   * Rejects values that look like raw secrets (too long / contains spaces poorly).
   */
  credentialsReference: z.string().trim().min(8).max(128).optional(),
});

/**
 * Connect Kadaster integration metadata for this user/org.
 * Live BMKL OAuth is not invented here — stores connection intent + safe reference.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, company_name')
    .eq('id', user.id)
    .maybeSingle();

  const plan = (profile as { plan?: string } | null)?.plan ?? 'gratis';
  if (!canUseFeature(plan, 'klic_api_integration')) {
    return NextResponse.json(
      { error: 'KLIC API-integratie vereist een hoger plan', code: 'FEATURE_NOT_ENTITLED' },
      { status: 402 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 });
  }

  const company =
    (profile as { company_name?: string | null } | null)?.company_name?.trim() ||
    body.accountReference ||
    user.email ||
    'EarthGND organisatie';

  const bmklLive = process.env.KLIC_BMKL_ENABLED === 'true';
  const useMock = process.env.KLIC_PROVIDER_MODE === 'dev_mock';

  const status = bmklLive || useMock ? 'connected' : 'configuration_required';
  const provider = useMock ? 'dev_mock' : bmklLive ? 'kadaster_bmkl' : 'manual';

  const { data, error } = await supabase
    .from('klic_integrations')
    .upsert(
      {
        user_id: user.id,
        provider,
        status,
        provider_account_reference: company,
        // Store opaque reference only when provided — never log it
        encrypted_credentials_reference: body.credentialsReference ?? null,
        last_verified_at: status === 'connected' ? new Date().toISOString() : null,
        last_error_code: status === 'configuration_required'
          ? 'ACCOUNT_CONFIGURATION_REQUIRED'
          : null,
      },
      { onConflict: 'user_id' },
    )
    .select('status, provider, provider_account_reference, last_verified_at, last_error_code')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    integration: sanitizeIntegration(data as Record<string, unknown>),
    note: bmklLive
      ? null
      : 'BMKL live is uitgeschakeld tot officiële Kadaster-configuratie beschikbaar is. Handmatige KLIC blijft beschikbaar.',
  });
}
