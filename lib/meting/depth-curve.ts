/** Depth-curve helpers for monteur veldmeting (3 m steps). */

export type DepthPoint = { depth: number; ra: number };

/**
 * Build empty Ra rows every 3 m up to the step that covers `maxDepth`.
 * Example: 20 m → depths 3…21 (7 rows).
 */
export function buildInitialCurve(maxDepth: number): DepthPoint[] {
  if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
    return [{ depth: 3, ra: 0 }];
  }
  const lastDepth = Math.max(3, Math.ceil(maxDepth / 3) * 3);
  const rows: DepthPoint[] = [];
  for (let d = 3; d <= lastDepth; d += 3) {
    rows.push({ depth: d, ra: 0 });
  }
  return rows;
}

/**
 * Prefer a saved curve with real measurements; otherwise seed/expand from expected depth
 * so the monteur does not have to add rows up front.
 */
export function resolveInitialCurve(
  saved: DepthPoint[] | null | undefined,
  expectedDepth?: number | null,
): DepthPoint[] {
  const hasMeasuredRa = (saved?.length ?? 0) > 0 && saved!.some(p => Number(p.ra) > 0);
  if (hasMeasuredRa) return saved!;

  if (expectedDepth && expectedDepth > 0) {
    const target = buildInitialCurve(expectedDepth);
    // Keep a longer empty draft if the monteur already added deeper empty rows.
    if ((saved?.length ?? 0) > target.length) return saved!;
    return target;
  }

  if (saved?.length) return saved;
  return [{ depth: 3, ra: 0 }];
}

/** Display label for a positive stored depth (e.g. 9 → "−9 m"). */
export function formatDepthLabel(depthM: number): string {
  return `−${depthM} m`;
}
