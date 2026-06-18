import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const ALLOWED_EMAILS = ['niel.baaijens@gmail.com'];

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Who is logged in?
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  const result: Record<string, unknown> = {
    user_email:           user?.email ?? null,
    user_email_lowercase: user?.email?.toLowerCase() ?? null,
    user_id:              user?.id ?? null,
    user_error:           userError?.message ?? null,
    service_role_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    site_url:             process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };

  if (!user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Check pendiepte_metingen via regular client (RLS active)
  const { data: rls_rows, error: rls_error } = await supabase
    .from('pendiepte_metingen')
    .select('calculation_id, status, monteur_email, monteur_user_id, calculator_user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  result.rls_rows  = rls_rows;
  result.rls_error = rls_error?.message ?? null;

  // 3. Check via admin client (bypasses RLS)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // All rows matching this email (any status) — exact match
    const { data: admin_by_email, error: admin_error } = await admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email, monteur_user_id, calculator_user_id, created_at')
      .eq('monteur_email', user.email)
      .order('created_at', { ascending: false })
      .limit(5);

    result.admin_by_email  = admin_by_email;
    result.admin_error     = admin_error?.message ?? null;

    // Case-insensitive search (ilike) — reveals case sensitivity issues
    const { data: admin_ilike } = await admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email')
      .ilike('monteur_email', user.email)
      .order('created_at', { ascending: false })
      .limit(5);

    result.admin_ilike_match = admin_ilike;

    // 4. Simulate /api/meting/pending logic exactly
    const { data: pending, error: pending_error } = await admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email')
      .eq('monteur_email', user.email)
      .eq('status', 'invited')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    result.pending_calculationId = pending?.calculation_id ?? null;
    result.pending_error         = pending_error?.message ?? null;
    result.pending_error_code    = pending_error?.code ?? null;

    // 5. All recent rows (no filter) — see what's in the table
    const { data: all_recent } = await admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    result.all_recent_rows = all_recent;
  } else {
    result.admin_skip_reason = 'SUPABASE_SERVICE_ROLE_KEY not set in this environment';
  }

  return NextResponse.json(result, { headers: { 'Content-Type': 'application/json' } });
}
