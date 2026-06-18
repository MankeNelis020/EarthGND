import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from('information_schema.columns' as string)
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', 'calculations')
    .eq('table_schema', 'public')
    .order('ordinal_position');

  if (error) {
    // Fallback: try a direct select with no rows to get column metadata from PostgREST
    const { data: sample, error: e2 } = await supabase
      .from('calculations')
      .select('*')
      .limit(0);
    return NextResponse.json({ information_schema_error: error.message, sample, e2 });
  }

  return NextResponse.json({ columns: data });
}
