import { NextRequest, NextResponse } from 'next/server';
import { lookupPostcode } from '@/lib/pdok';

export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get('postcode');
  const houseNumber = request.nextUrl.searchParams.get('houseNumber') ?? undefined;

  if (!postcode) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  try {
    const result = await lookupPostcode(postcode, houseNumber);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
