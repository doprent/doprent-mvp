/** A single pricing tier entry: applies from `minDays` onwards. */
export type TierEntry = { minDays: number; pricePerDay: number };

/** Given sorted TierEntry[], return display range string for index i. */
export function tierRangeLabel(entries: TierEntry[], i: number): string {
  const sorted = [...entries].sort((a, b) => a.minDays - b.minDays);
  const isLast = i === sorted.length - 1;
  const minD = sorted[i].minDays;
  if (isLast) return `${minD} วันขึ้นไป`;
  const nextMin = sorted[i + 1].minDays;
  return `${minD}–${nextMin - 1} วัน`;
}

/** Compute total rental cost for N nights from TierEntry[]. */
export function computeTotal(entries: TierEntry[], nights: number): number {
  const sorted = [...entries].sort((a, b) => a.minDays - b.minDays);
  let applicable = sorted[0];
  for (const t of sorted) {
    if (nights >= t.minDays) applicable = t;
  }
  return (applicable?.pricePerDay ?? 0) * nights;
}
