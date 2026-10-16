import type { Furniture } from './model.ts';
import { isSideways } from './rotation.ts';

export function footprint(item: Furniture) {
  return { x: item.x, y: item.y,
    width: isSideways(item) ? item.depth : item.width,
    depth: isSideways(item) ? item.width : item.depth };
}
export function overlaps(a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y;
}
