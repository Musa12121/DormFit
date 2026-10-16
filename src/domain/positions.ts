// Keep the usual 10 cm grid in small rooms, but sample fewer points in large rooms.
// Always include the edges, centre and useful furniture alignment points.
export function axisPositions(max: number, anchors: number[] = [], min = 0): number[] {
  if (!Number.isFinite(max) || max < min) return [];
  const step = Math.max(10, Math.ceil((max - min) / 100 / 10) * 10);
  const values = new Set([min, max, (min + max) / 2]);
  for (let value = min; value <= max; value += step) values.add(value);
  for (const anchor of anchors) {
    if (anchor >= min && anchor <= max) values.add(anchor);
  }
  return [...values].sort((a, b) => a - b);
}
