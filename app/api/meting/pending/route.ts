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

  // Admin client — monteur_user_id is still NULL on first login,
  // so RLS SELECT policies block a regular client query by email.
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await adminClient
    .from('pendiepte_metingen')
    .select('calculation_id')
    .eq('monteur_email', user.email)
    .eq('status', 'invited')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ calculationId: meting?.calculation_id ?? null });
}
