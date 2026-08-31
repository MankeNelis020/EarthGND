/** Agreement / error metrics for theory vs empirical / GeoTOP. */

export function relativeErrorPct(actual: number, predicted: number): number | null {
  if (!(actual > 0) || !Number.isFinite(predicted)) return null;
  return (Math.abs(predicted - actual) / actual) * 100;
}

export function absoluteError(actual: number, predicted: number): number {
  return Math.abs(predicted - actual);
}

/**
 * Agreement score 0–1 from relative error %.
 * 0% error → 1; ≥100% → 0. Linear in between.
 */
export function agreementFromRelativeErrorPct(relPct: number | null): number {
  if (relPct == null || !Number.isFinite(relPct)) return 0;
  return Math.max(0, Math.min(1, 1 - relPct / 100));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

export function mae(actuals: number[], preds: number[]): number | null {
  if (!actuals.length || actuals.length !== preds.length) return null;
  return mean(actuals.map((a, i) => Math.abs(a - preds[i]!)));
}

export function mapePct(actuals: number[], preds: number[]): number | null {
  if (!actuals.length || actuals.length !== preds.length) return null;
  const errs: number[] = [];
  for (let i = 0; i < actuals.length; i++) {
    const e = relativeErrorPct(actuals[i]!, preds[i]!);
    if (e != null) errs.push(e);
  }
  return mean(errs);
}
