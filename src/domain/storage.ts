import type { FurnitureKind, Owner, Project, SavedProject } from './model.ts';
import { supportedFurniture } from './model.ts';
import { MAX_ROOM_CM, MIN_ROOM_CM } from './limits.ts';
import { getOpenings, openingsProblem } from './openings.ts';

const kinds: FurnitureKind[] = supportedFurniture.map(entry => entry.kind);
const owners: Owner[] = ['a', 'b', 'shared'];
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const shortText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 80;

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Project;
  if (
    p.version !== 1 ||
    !shortText(p.name) ||
    !p.room ||
    !number(p.room.width, MIN_ROOM_CM, MAX_ROOM_CM) ||
    !number(p.room.depth, MIN_ROOM_CM, MAX_ROOM_CM)
  )
    return false;
  if (p.room.height !== undefined && !number(p.room.height, 180, 600)) return false;
  if (openingsProblem(p.room)) return false;
  if (
    !number(p.room.door, 60, Math.min(140, p.room.width)) ||
    !number(p.room.window, 60, p.room.width - 20)
  )
    return false;
  if (
    p.roommates !== undefined &&
    (!Array.isArray(p.roommates) ||
      p.roommates.length !== 2 ||
      !p.roommates.every(
        (r) =>
          r &&
          shortText(r.name) &&
          typeof r.daylight === 'boolean' &&
          typeof r.privacy === 'boolean',
      ))
  )
    return false;
  if (!Array.isArray(p.furniture) || p.furniture.length > 30) return false;
  const ids = new Set<string>();
  return p.furniture.every((f) => {
    if (!f || !shortText(f.id) || ids.has(f.id) || getOpenings(p.room).some((opening) => opening.id === f.id)) return false;
    ids.add(f.id);
    return (
      kinds.includes(f.kind) &&
      owners.includes(f.owner) &&
      shortText(f.name) &&
      number(f.width, 20, 400) &&
      number(f.depth, 20, 400) &&
      number(f.x, -1000, MAX_ROOM_CM + 1000) &&
      number(f.y, -1000, MAX_ROOM_CM + 1000) &&
      typeof f.rotated === 'boolean'
    );
  });
}
export const CURRENT_KEY = 'dormfit.workspace.v1';
export const SAVED_KEY = 'dormfit.saved.v1';
export function readCurrent(): Project | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CURRENT_KEY) ?? 'null');
    return isProject(value) ? value : null;
  } catch {
    return null;
  }
}
export function readSaved(): SavedProject[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(data)
      ? data
          .filter(
            (s): s is SavedProject =>
              typeof s?.id === 'string' && typeof s?.updatedAt === 'string' && isProject(s.project),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
