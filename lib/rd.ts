// WGS84 (EPSG:4326) → RD New (EPSG:28992) polynomial approximation
// Accuracy: ~1 m within the Netherlands
// Coefficients from RDNAPTRANS white paper (Kadaster / NCG)

const PHI_0 = 52.15517440;
const LAM_0 = 5.38720621;

export function wgs84ToRd(lat: number, lon: number): { rdX: number; rdY: number } {
  const dPhi = 0.36 * (lat - PHI_0);
  const dLam = 0.36 * (lon - LAM_0);

  const Kp: [number, number, number][] = [
    [0, 1,  190094.945],
    [2, 1,  -11832.228],
    [0, 3,    -144.221],
    [2, 3,     -32.391],
    [1, 0,      -0.705],
    [4, 1,      -2.340],
    [2, 5,      -0.608],
    [0, 7,      -0.008],
  ];

  const Lp: [number, number, number][] = [
    [1, 0,  309056.544],
    [1, 2,   22238.523],
    [3, 0,     -43.472],
    [1, 4,  -33995.354],
    [3, 2,      -0.551],
    [1, 6,      -2.956],
    [5, 0,       0.076],
    [3, 4,      -0.049],
  ];

  let rdX = 155000;
  for (const [p, q, c] of Kp) rdX += c * Math.pow(dPhi, p) * Math.pow(dLam, q);

  let rdY = 463000;
  for (const [p, q, c] of Lp) rdY += c * Math.pow(dPhi, p) * Math.pow(dLam, q);

  return { rdX, rdY };
}
