import type { Furniture } from './model.ts';
import { isBed, isWallMounted, occupiesFloor } from './model.ts';
import { footprint, overlaps } from './geometry.ts';

// Edge-to-edge clearance for solid furniture; rugs remain walkable underneath it.
export const MIN_FURNITURE_GAP = 30;
export const PREFERRED_FURNITURE_GAP = 60;
export const MIN_BEDSIDE_GAP = 10;
export const MAX_BEDSIDE_GAP = 20;
export const MIN_DINING_CHAIR_GAP = 10;
export const TV_DINING_CLEARANCE = 60;
export const PREFERRED_TV_DINING_CLEARANCE = 100;
export const isTvDiningPair = (a: Furniture, b: Furniture) =>
  (['television', 'tv-stand'].includes(a.kind) && ['dining-table', 'chair'].includes(b.kind))
  || (['television', 'tv-stand'].includes(b.kind) && ['dining-table', 'chair'].includes(a.kind));
export const isDiningPair = (a: Furniture, b: Furniture) =>
  (a.kind === 'dining-table' && b.kind === 'chair') || (b.kind === 'dining-table' && a.kind === 'chair');
export const isBedsidePair = (a: Furniture, b: Furniture) =>
  (isBed(a.kind) && b.kind === 'nightstand') || (isBed(b.kind) && a.kind === 'nightstand');
export const minimumFurnitureGap = (a: Furniture, b: Furniture) => isBedsidePair(a, b) ? MIN_BEDSIDE_GAP
  : isDiningPair(a, b) ? MIN_DINING_CHAIR_GAP : isTvDiningPair(a, b) ? TV_DINING_CLEARANCE : MIN_FURNITURE_GAP;

export function furnitureGap(a: Furniture, b: Furniture) {
  const first = footprint(a), second = footprint(b);
  return Math.hypot(
    Math.max(first.x - second.x - second.width, second.x - first.x - first.width, 0),
    Math.max(first.y - second.y - second.depth, second.y - first.y - first.depth, 0),
  );
}

export const tvDiningTooClose = (a: Furniture, b: Furniture) =>
  isTvDiningPair(a, b) && furnitureGap(a, b) < TV_DINING_CLEARANCE - .001;

// Prefer a distinct dining area beyond the hard minimum clearance.
export function diningTvPenalty(items: Furniture[]) {
  const televisions = items.filter(item => ['television', 'tv-stand'].includes(item.kind));
  const dining = items.filter(item => ['dining-table', 'chair'].includes(item.kind));
  return televisions.reduce((sum, tv) => sum + dining.reduce((score, item) =>
    score + Math.max(0, PREFERRED_TV_DINING_CLEARANCE - furnitureGap(tv, item)), 0), 0);
}

export function tooClose(a: Furniture, b: Furniture) {
  return occupiesFloor(a) && occupiesFloor(b) && furnitureGap(a, b) < minimumFurnitureGap(a, b) - 0.001;
}

export function placementConflict(a: Furniture, b: Furniture) {
  return tooClose(a, b) || (isWallMounted(a) && isWallMounted(b) && overlaps(footprint(a), footprint(b)));
}
