export interface PdokResult {
  postcode: string;
  lat: number;
  lon: number;
  rdX: number;
  rdY: number;
}

export async function lookupPostcode(postcode: string): Promise<PdokResult> {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase();
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(cleaned)}&fq=type:postcode&rows=1&fl=centroide_ll,centroide_rd,postcode`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`PDOK request failed: ${res.status}`);

  const data = await res.json();
  const doc = data?.response?.docs?.[0];
  if (!doc) throw new Error('Postcode not found');

  const llMatch = doc.centroide_ll?.match(/POINT\(([^ ]+) ([^)]+)\)/);
  const rdMatch = doc.centroide_rd?.match(/POINT\(([^ ]+) ([^)]+)\)/);

  if (!llMatch || !rdMatch) throw new Error('Invalid PDOK response format');

  return {
    postcode: cleaned,
    lon: parseFloat(llMatch[1]),
    lat: parseFloat(llMatch[2]),
    rdX: parseFloat(rdMatch[1]),
    rdY: parseFloat(rdMatch[2]),
  };
}
