import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return NextResponse.json({ calculationId: null });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[meting/pending] SUPABASE_SERVICE_ROLE_KEY not set');
    return NextResponse.json({ calculationId: null, error: 'no_service_key' });
  }

  // Admin client — monteur_user_id is still NULL on first login,
  // so RLS SELECT policies block a regular client query by email.
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data: meting, error: metingError } = await adminClient
    .from('pendiepte_metingen')
    .select('calculation_id, status, monteur_email')
    .ilike('monteur_email', user.email)
    .eq('status', 'invited')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (metingError && metingError.code !== 'PGRST116') {
    console.error('[meting/pending] admin query error:', metingError.message, 'email:', user.email);
  } else if (!meting) {
    console.log('[meting/pending] no invited meting for email:', user.email);
  } else {
    console.log('[meting/pending] found meting:', meting.calculation_id, 'for email:', user.email);
  }

  return NextResponse.json({ calculationId: meting?.calculation_id ?? null });
}
