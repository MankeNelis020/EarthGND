import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const CANDIDATES = [
  'id', 'user_id', 'tool', 'postcode', 'created_at', 'pdf_url',
  'input', 'input_values',
  'result', 'resultaat',
  'risicoklasse', 'credit_gebruikt',
  'rapport_naam', 'monteur_email', 'monteur_invited_at',
];

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const results: Record<string, boolean> = {};

  await Promise.all(CANDIDATES.map(async (col) => {
    const { error } = await supabase.from('calculations').select(col).limit(0);
    results[col] = !error;
  }));

  return NextResponse.json({ exists: results });
}
