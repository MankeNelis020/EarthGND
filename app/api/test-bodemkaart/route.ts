/**
 * Tijdelijke testroute — verwijder na verificatie.
 * GET /api/test-bodemkaart?postcode=1234AB
 * GET /api/test-bodemkaart?rdX=121000&rdY=487000
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchBodemkaartSoilType } from '@/lib/bodemkaart';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  let rdX: number | null = null;
  let rdY: number | null = null;

  // Direct RD-coördinaten
  if (searchParams.has('rdX') && searchParams.has('rdY')) {
    rdX = parseFloat(searchParams.get('rdX')!);
    rdY = parseFloat(searchParams.get('rdY')!);
  }
  // Postcode → PDOK → RD
  else if (searchParams.has('postcode')) {
    const postcode = searchParams.get('postcode')!.replace(/\s/g, '').toUpperCase();
    const pdokRes = await fetch(
      `${request.nextUrl.origin}/api/pdok?postcode=${encodeURIComponent(postcode)}`,
    );
    if (!pdokRes.ok) return NextResponse.json({ error: 'PDOK lookup mislukt' }, { status: 400 });
    const pdok = await pdokRes.json();
    rdX = pdok.rdX;
    rdY = pdok.rdY;
  } else {
    return NextResponse.json(
      { error: 'Geef ?postcode=1234AB of ?rdX=...&rdY=... op' },
      { status: 400 },
    );
  }

  const samples = await fetchBodemkaartSoilType(rdX!, rdY!);

  return NextResponse.json({
    rdX,
    rdY,
    bodemkaart: samples ?? null,
    status: samples ? 'found' : 'not_found (water, buiten NL, of tabel niet geïmporteerd)',
  });
}
