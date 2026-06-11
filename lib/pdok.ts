export interface PdokResult {
  postcode: string;
  lat: number;
  lon: number;
  rdX: number;
  rdY: number;
  straatnaam?: string;
  huisnummer?: string;
  woonplaats?: string;
}

export async function lookupPostcode(postcode: string, huisnummer?: string): Promise<PdokResult> {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase();
  const query = huisnummer ? `${cleaned} ${huisnummer}` : cleaned;
  const type = huisnummer ? 'adres' : 'postcode';
  const fields = 'centroide_ll,centroide_rd,postcode,straatnaam,huisnummer,woonplaatsnaam';

  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fq=type:${type}&rows=1&fl=${fields}`;

  const res = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`PDOK request failed: ${res.status}`);

  const data = await res.json();
  const doc = data?.response?.docs?.[0];
  if (!doc) throw new Error(huisnummer ? 'Adres niet gevonden' : 'Postcode niet gevonden');

  const llMatch = doc.centroide_ll?.match(/POINT\(([^ ]+) ([^)]+)\)/);
  const rdMatch = doc.centroide_rd?.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (!llMatch || !rdMatch) throw new Error('Ongeldig PDOK response formaat');

  return {
    postcode: cleaned,
    lon: parseFloat(llMatch[1]),
    lat: parseFloat(llMatch[2]),
    rdX: parseFloat(rdMatch[1]),
    rdY: parseFloat(rdMatch[2]),
    straatnaam: doc.straatnaam,
    huisnummer: doc.huisnummer?.toString(),
    woonplaats: doc.woonplaatsnaam,
  };
}
