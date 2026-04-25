export interface PdokResult {
  postcode: string;
  houseNumber?: string;
  lat: number;
  lon: number;
  rdX: number;
  rdY: number;
  source: 'adres' | 'postcode';
}

function parsePoint(wkt?: string) {
  const match = wkt?.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (!match) return null;
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}

export async function lookupPostcode(postcode: string, houseNumber?: string): Promise<PdokResult> {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase();
  const query = houseNumber?.trim() ? `${cleaned} ${houseNumber.trim()}` : cleaned;

  const exactUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fq=type:${houseNumber ? 'adres' : 'postcode'}&rows=1&fl=centroide_ll,centroide_rd,postcode,huis_nlt`;

  const res = await fetch(exactUrl, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`PDOK request failed: ${res.status}`);

  const data = await res.json();
  const doc = data?.response?.docs?.[0];
  if (!doc && houseNumber) {
    return lookupPostcode(cleaned);
  }
  if (!doc) throw new Error('Postcode/adres niet gevonden');

  const ll = parsePoint(doc.centroide_ll);
  const rd = parsePoint(doc.centroide_rd);
  if (!ll || !rd) throw new Error('Invalid PDOK response format');

  return {
    postcode: cleaned,
    houseNumber: houseNumber?.trim() || undefined,
    lon: ll.x,
    lat: ll.y,
    rdX: rd.x,
    rdY: rd.y,
    source: houseNumber ? 'adres' : 'postcode',
  };
}
