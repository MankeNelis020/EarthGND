export interface GeoAddress {
  postcode:   string;
  straatnaam: string;
  huisnummer: string;
  woonplaats: string;
}

export interface GeoCoords {
  lat: number;
  lon: number;
}

async function pdokFetch(url: string): Promise<{ response?: { docs?: Record<string, unknown>[] } } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Reverse geocode (lat/lon → NL address) using PDOK Locatieserver. No API key needed. */
export async function reverseGeocode(lat: number, lon: number): Promise<GeoAddress | null> {
  const data = await pdokFetch(
    `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse` +
    `?lat=${lat}&lon=${lon}&type=adres&rows=1&fl=postcode,straatnaam,huisnummer,woonplaatsnaam`,
  );
  const doc = data?.response?.docs?.[0];
  if (!doc?.postcode) return null;
  return {
    postcode:   String(doc.postcode),
    straatnaam: String(doc.straatnaam ?? ''),
    huisnummer: String(doc.huisnummer ?? ''),
    woonplaats: String(doc.woonplaatsnaam ?? ''),
  };
}

/** Forward geocode (NL address/postcode → lat/lon) using PDOK Locatieserver. No API key needed. */
export async function forwardGeocode(query: string): Promise<(GeoCoords & Partial<GeoAddress>) | null> {
  const data = await pdokFetch(
    `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free` +
    `?q=${encodeURIComponent(query)}&rows=1&fl=centroide_ll,postcode,straatnaam,huisnummer,woonplaatsnaam`,
  );
  const doc = data?.response?.docs?.[0];
  if (!doc?.centroide_ll) return null;
  // centroide_ll is WKT: "POINT(lon lat)"
  const m = /POINT\(([0-9.]+)\s+([0-9.]+)\)/.exec(String(doc.centroide_ll));
  if (!m) return null;
  return {
    lon:        Number(m[1]),
    lat:        Number(m[2]),
    postcode:   String(doc.postcode   ?? ''),
    straatnaam: String(doc.straatnaam ?? ''),
    huisnummer: String(doc.huisnummer ?? ''),
    woonplaats: String(doc.woonplaatsnaam ?? ''),
  };
}
