import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getConversation } from '@/lib/support/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { id } = await params;

  try {
    const conversation = await getConversation(id, user.id);
    return NextResponse.json({ conversation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    const status = msg.includes('niet gevonden') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
