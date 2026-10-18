import type { Furniture, Project, Room, Rotation } from './model.ts';
import { isBed, isWallMounted, occupiesFloor } from './model.ts';
import { footprint, overlaps } from './geometry.ts';
import { furniturePoint, orientation, rotationOf } from './rotation.ts';
import { furnitureGap, MAX_BEDSIDE_GAP, MIN_BEDSIDE_GAP, MIN_DINING_CHAIR_GAP, MIN_FURNITURE_GAP, tvDiningTooClose, TV_DINING_CLEARANCE } from './spacing.ts';
import { doorZones, entranceZones } from './openings.ts';

export const STORAGE_FRONT_CLEARANCE = 60;
export const SOFA_LEGROOM = 60;
const storage = new Set(['wardrobe', 'dresser', 'cabinet', 'fridge', 'washing-machine']);
export const isChair = (item: Furniture) => item.kind === 'office-chair' || item.kind === 'chair';
const isWorkTable = (item: Furniture) => item.kind === 'desk' || item.kind === 'vanity';
export const requiresFourSeatDining = (furniture: Furniture[]) =>
  furniture.filter(item => item.kind === 'dining-table').length === 1
  && furniture.filter(item => item.kind === 'chair').length === 4 && !furniture.some(isWorkTable);

export function diningSetChairs(table: Furniture, furniture: Furniture[]) {
  const chairs = furniture.filter(item => item.kind === 'chair');
  return furniture.filter(item => item.kind === 'dining-table').length === 1 && !furniture.some(isWorkTable)
    ? chairs : chairs.filter(chair => chairTarget(chair, furniture)?.id === table.id);
}

export function fourSeatDiningAllowed(table: Furniture, chairs: Furniture[]) {
  if (chairs.length !== 4) return true;
  const direction = (rotationOf(table) + (table.width >= table.depth ? 0 : 90)) % 180;
  return chairs.every(chair => facesTable(chair, table) && rotationOf(chair) % 180 === direction)
    && chairs.filter(chair => rotationOf(chair) === direction).length === 2
    && chairs.filter(chair => rotationOf(chair) === direction + 180).length === 2;
}
const tallFurniture = new Set(['wardrobe', 'shelf', 'fridge', 'clothes-rack', 'floor-lamp']);
export const TV_VIEWING_CLEARANCE = 150;
const isTv = (item: Furniture) => item.kind === 'television' || item.kind === 'tv-stand';
export const isSofa = (item: Furniture) => item.kind === 'sofa' || item.kind === 'armchair';
const viewingObstacles = new Set([...tallFurniture, 'desk', 'vanity', 'bunk-bed', 'sofa', 'armchair']);

function directionalVector(item: Furniture, dx: number, dy: number) {
  switch (rotationOf(item)) {
    case 90: return { forward: -dx, sideways: dy };
    case 180: return { forward: -dy, sideways: dx };
    case 270: return { forward: dx, sideways: dy };
    default: return { forward: dy, sideways: dx };
  }
}

export function canWatchFromSofa(sofa: Furniture, tv: Furniture, furniture: Furniture[] = []) {
  const screen = footprint(tv);
  const target = [screen.x + screen.width / 2, screen.y + screen.depth / 2];
  const seats = sofa.kind === 'sofa' ? 3 : 1;
  return Array.from({ length: seats }, (_, index) => {
    const eye = furniturePoint(sofa, sofa.width * (index + .5) / seats, sofa.depth * .55);
    const view = directionalVector(sofa, target[0] - eye[0], target[1] - eye[1]);
    const screenView = directionalVector(tv, eye[0] - target[0], eye[1] - target[1]);
    if (view.forward < MIN_FURNITURE_GAP || Math.abs(view.sideways) > view.forward + .001
      || screenView.forward <= 0 || Math.abs(screenView.sideways) > screenView.forward * Math.tan(Math.PI / 3)) return false;
    return !furniture.some(other => other.id !== sofa.id && other.id !== tv.id && viewingObstacles.has(other.kind)
      && crossesSightLine(eye, target, other));
  }).every(Boolean);
}

function viewVector(bed: Furniture, tv: Furniture) {
  const eye = furniturePoint(bed, bed.width / 2, bed.depth * .15);
  const screen = footprint(tv);
  const target = [screen.x + screen.width / 2, screen.y + screen.depth / 2];
  const dx = target[0] - eye[0], dy = target[1] - eye[1];
  switch (rotationOf(bed)) {
    case 90: return { eye, target, forward: -dx, sideways: dy };
    case 180: return { eye, target, forward: -dy, sideways: dx };
    case 270: return { eye, target, forward: dx, sideways: dy };
    default: return { eye, target, forward: dy, sideways: dx };
  }
}

function crossesSightLine(start: number[], end: number[], item: Furniture) {
  const rect = footprint(item);
  let from = 0, to = 1;
  for (const [origin, delta, min, max] of [
    [start[0], end[0] - start[0], rect.x - 5, rect.x + rect.width + 5],
    [start[1], end[1] - start[1], rect.y - 5, rect.y + rect.depth + 5],
  ]) {
    if (Math.abs(delta) < .001) { if (origin < min || origin > max) return false; }
    else {
      const first = (min - origin) / delta, last = (max - origin) / delta;
      from = Math.max(from, Math.min(first, last)); to = Math.min(to, Math.max(first, last));
      if (from > to) return false;
    }
  }
  return from < 1 && to > 0;
}

export function canWatchTv(bed: Furniture, tv: Furniture, furniture: Furniture[] = []) {
  if (rotationOf(tv) !== (rotationOf(bed) + 180) % 360) return false;
  const view = viewVector(bed, tv);
  // Look forward past the foot of the bed, within a 30 degree horizontal cone.
  if (view.forward < bed.depth * .85 + 30 || Math.abs(view.sideways) > view.forward * Math.tan(Math.PI / 6)) return false;
  return !furniture.some(other => other.id !== bed.id && other.id !== tv.id && viewingObstacles.has(other.kind)
    && crossesSightLine(view.eye, view.target, other));
}

export function tvViewingScore(tv: Furniture, furniture: Furniture[]) {
  const beds = furniture.filter(item => isBed(item.kind));
  if (!beds.length) return 0;
  const scores = beds.filter(bed => canWatchTv(bed, tv, furniture)).map(bed => {
    const view = viewVector(bed, tv);
    return Math.abs(view.sideways) / view.forward * 1000 + view.forward * .02;
  });
  return scores.length ? Math.min(...scores) : Infinity;
}

export function blocksTv(tv: Furniture, other: Furniture) {
  return isTv(tv) && tallFurniture.has(other.kind) && overlaps(frontZone(tv, TV_VIEWING_CLEARANCE), footprint(other));
}

export function besideBed(table: Furniture, bed: Furniture) {
  if (rotationOf(table) !== rotationOf(bed)) return false;
  const stand = footprint(table), rect = footprint(bed), rotation = rotationOf(bed);
  const horizontal = rotation % 180 === 0;
  const gaps = horizontal ? [rect.x - stand.x - stand.width, stand.x - rect.x - rect.width]
    : [rect.y - stand.y - stand.depth, stand.y - rect.y - rect.depth];
  const headOffset = rotation === 0 ? stand.y - rect.y : rotation === 180 ? rect.y + rect.depth - stand.y - stand.depth
    : rotation === 90 ? rect.x + rect.width - stand.x - stand.width : stand.x - rect.x;
  return gaps.some(gap => gap >= MIN_BEDSIDE_GAP - .001 && gap <= MAX_BEDSIDE_GAP + .001)
    && headOffset >= -.001 && headOffset <= 40;
}

export function bedsidePositions(table: Furniture, furniture: Furniture[]) {
  const positions: Furniture[] = [];
  for (const bed of furniture.filter(item => isBed(item.kind))) {
    const rotation = rotationOf(bed), rect = footprint(bed);
    const stand = footprint({ ...table, ...orientation(rotation) });
    for (const gap of [15, 10, 20]) for (const shift of [0, 10, 20, 30, 40]) for (const side of [-1, 1]) {
      const horizontal = rotation % 180 === 0;
      const x = horizontal ? side < 0 ? rect.x - gap - stand.width : rect.x + rect.width + gap
        : rotation === 90 ? rect.x + rect.width - stand.width - shift : rect.x + shift;
      const y = horizontal ? rotation === 0 ? rect.y + shift : rect.y + rect.depth - stand.depth - shift
        : side < 0 ? rect.y - gap - stand.depth : rect.y + rect.depth + gap;
      positions.push({ ...table, ...orientation(rotation), x, y });
    }
  }
  return positions;
}

export function frontZone(item: Furniture, distance: number) {
  const rect = footprint(item);
  switch (rotationOf(item)) {
    case 90: return { x: rect.x - distance, y: rect.y, width: distance, depth: rect.depth };
    case 180: return { x: rect.x, y: rect.y - distance, width: rect.width, depth: distance };
    case 270: return { x: rect.x + rect.width, y: rect.y, width: distance, depth: rect.depth };
    default: return { x: rect.x, y: rect.y + rect.depth, width: rect.width, depth: distance };
  }
}

export function operatingZone(item: Furniture, workspaceDepth = 0) {
  const distance = storage.has(item.kind) ? STORAGE_FRONT_CLEARANCE
    : isSofa(item) ? SOFA_LEGROOM : item.kind === 'nightstand' ? 45 : isWorkTable(item) ? workspaceDepth : 0;
  return distance ? frontZone(item, distance) : null;
}

export function workspaceDepth(furniture: Furniture[]) {
  const chairs = furniture.filter(isChair);
  return chairs.length ? MIN_FURNITURE_GAP * 2 + Math.max(...chairs.map(item => item.depth)) : 0;
}

export function functionalPlacementAllowed(item: Furniture, room: Room, others: Furniture[], workDepth = 0) {
  if (isTv(item) && doorZones(room).some(zone => overlaps(frontZone(item, TV_VIEWING_CLEARANCE), zone))) return false;
  const zone = operatingZone(item, workDepth);
  if (zone && (zone.x < 0 || zone.y < 0 || zone.x + zone.width > room.width || zone.y + zone.depth > room.depth)) return false;
  if (zone && isWorkTable(item) && entranceZones(room).some(entrance => overlaps(zone, entrance))) return false;
  for (const other of others) {
    if (tvDiningTooClose(item, other)) return false;
    if (blocksTv(item, other) || blocksTv(other, item)) return false;
    if (!occupiesFloor(item) || !occupiesFloor(other)) continue;
    if (zone && !(isWorkTable(item) && isChair(other)) && overlaps(zone, footprint(other))) return false;
    const otherZone = operatingZone(other, workDepth);
    if (otherZone && !(isWorkTable(other) && isChair(item)) && overlaps(otherZone, footprint(item))) return false;
  }
  const furniture = [...others.filter(other => other.id !== item.id), item];
  const beds = furniture.filter(other => isBed(other.kind));
  if (beds.length && furniture.some(tv => isTv(tv) && !beds.some(bed => canWatchTv(bed, tv, furniture)))) return false;
  const televisions = furniture.filter(isTv);
  if (televisions.length && furniture.filter(isSofa).some(sofa => !televisions.some(tv => canWatchFromSofa(sofa, tv, furniture)))) return false;
  return true;
}

export function chairTarget(chair: Furniture, furniture: Furniture[]) {
  if (!isChair(chair)) return undefined;
  const targets = furniture.filter(item => isWorkTable(item) || (chair.kind === 'chair' && item.kind === 'dining-table'));
  targets.sort((a, b) => furnitureGap(chair, a) - furnitureGap(chair, b));
  const facingTarget = targets.find(target => facesTable(chair, target));
  if (facingTarget) return facingTarget;
  const target = targets[0];
  return target && (chair.kind === 'office-chair' || furnitureGap(chair, target) <= 120) ? target : undefined;
}

export function facesTable(chair: Furniture, table: Furniture) {
  const seat = footprint(chair), top = footprint(table);
  const facing = rotationOf(chair);
  if (isWorkTable(table) && facing !== (rotationOf(table) + 180) % 360) return false;
  const horizontal = facing === 90 || facing === 270;
  const alignment = horizontal
    ? Math.min(seat.y + seat.depth, top.y + top.depth) - Math.max(seat.y, top.y)
    : Math.min(seat.x + seat.width, top.x + top.width) - Math.max(seat.x, top.x);
  if (alignment < Math.min(horizontal ? seat.depth : seat.width, horizontal ? top.depth : top.width) / 2) return false;
  const gap = facing === 0 ? top.y - seat.y - seat.depth : facing === 90 ? seat.x - top.x - top.width
    : facing === 180 ? seat.y - top.y - top.depth : top.x - seat.x - seat.width;
  return gap >= (table.kind === 'dining-table' ? MIN_DINING_CHAIR_GAP : MIN_FURNITURE_GAP) - .001 && gap <= 90;
}

export function chairPositions(chair: Furniture, furniture: Furniture[], packed = false) {
  const positions: Furniture[] = [];
  const tables = furniture.filter(item => isWorkTable(item) || (chair.kind === 'chair' && item.kind === 'dining-table'));
  for (const table of tables) {
    const directions = isWorkTable(table) ? [rotationOf(table)] : [0, 90, 180, 270];
    for (const front of directions) {
      const rotation = ((front + 180) % 360) as Rotation;
      const rect = footprint({ ...chair, ...orientation(rotation) }), top = footprint(table);
      const horizontal = front === 90 || front === 270;
      const extent = horizontal ? top.depth : top.width;
      const seat = horizontal ? rect.depth : rect.width;
      const capacity = Math.max(1, Math.floor((extent + MIN_FURNITURE_GAP) / (seat + MIN_FURNITURE_GAP)));
      const spread = Array.from({ length: capacity }, (_, index) => capacity === 1 ? (extent - seat) / 2
        : index * (extent - seat) / (capacity - 1));
      const centred = [(extent - seat) / 2, (extent - seat) / 2 - extent * .25, (extent - seat) / 2 + extent * .25];
      const offsets = [...new Set([
        ...(packed ? [...spread, ...centred] : [...centred, ...spread]),
        ...(table.kind === 'dining-table' ? [-seat / 2, extent - seat / 2] : []),
      ])];
      const gaps = table.kind === 'dining-table' ? packed ? [15, 10, 20, 30, 40, 60] : [30, 40, 60, 15, 10, 20] : [30, 40, 60];
      for (const gap of gaps) {
        for (const offset of offsets) {
          const x = horizontal ? front === 90 ? top.x - gap - rect.width : top.x + top.width + gap
            : top.x + offset;
          const y = horizontal ? top.y + offset
            : front === 180 ? top.y - gap - rect.depth : top.y + top.depth + gap;
          positions.push({ ...chair, ...orientation(rotation), x, y });
        }
      }
    }
  }
  return positions;
}

export function usabilityIssues(project: Pick<Project, 'room' | 'furniture' | 'omittedChairs'>) {
  const issues: { type: 'operation' | 'facing' | 'bedside' | 'view' | 'spacing'; ids: string[]; text: string }[] = [];
  const beds = project.furniture.filter(item => isBed(item.kind));
  const televisions = project.furniture.filter(isTv);
  if (requiresFourSeatDining([...project.furniture, ...(project.omittedChairs ?? [])])
    && project.furniture.filter(item => item.kind === 'chair').length !== 4) {
    issues.push({ type: 'facing', ids: project.furniture.filter(item => item.kind === 'dining-table').map(item => item.id),
      text: 'Keep all four dining chairs, with two on each opposite long side.' });
  }
  for (const table of project.furniture.filter(item => item.kind === 'dining-table')) {
    const chairs = diningSetChairs(table, project.furniture);
    if (!fourSeatDiningAllowed(table, chairs)) issues.push({ type: 'facing', ids: [table.id, ...chairs.map(chair => chair.id)],
      text: `${table.name} needs two chairs on each of its two opposite long sides.` });
  }
  for (const item of project.furniture) {
    if (isSofa(item) && televisions.length && !televisions.some(tv => canWatchFromSofa(item, tv, project.furniture))) {
      issues.push({ type: 'view', ids: [item.id, ...televisions.map(tv => tv.id)],
        text: `${item.name} needs a TV in front of its seats with an unobstructed view of the screen.` });
    }
    if (isTv(item) && doorZones(project.room).some(zone => overlaps(frontZone(item, TV_VIEWING_CLEARANCE), zone))) {
      issues.push({ type: 'view', ids: [item.id], text: `${item.name} needs a viewing area clear of the door swing.` });
    }
    if (isTv(item) && beds.length && !beds.some(bed => canWatchTv(bed, item, project.furniture))) {
      issues.push({ type: 'view', ids: [item.id, ...beds.map(bed => bed.id)],
        text: `${item.name} must face a bed from beyond its foot with a clear viewing line.` });
    }
    if (item.kind === 'nightstand' && beds.length && !beds.some(bed => besideBed(item, bed))) {
      issues.push({ type: 'bedside', ids: [item.id],
        text: `${item.name} needs to be beside a bed's head with a 10–20 cm gap.` });
    }
    for (const other of project.furniture) {
      if (isWallMounted(item) && tvDiningTooClose(item, other)) issues.push({ type: 'spacing', ids: [item.id, other.id],
        text: `${other.name} and ${item.name} need at least ${TV_DINING_CLEARANCE} cm of space between them.` });
      if (other.id !== item.id && blocksTv(item, other)) issues.push({ type: 'view', ids: [item.id, other.id],
        text: `${other.name} blocks the viewing space in front of ${item.name}.` });
    }
    const zone = operatingZone(item);
    if (zone) {
      const blockers = project.furniture.filter(other => other.id !== item.id && occupiesFloor(other) && overlaps(zone, footprint(other)));
      const outside = zone.x < 0 || zone.y < 0 || zone.x + zone.width > project.room.width || zone.y + zone.depth > project.room.depth;
      if (outside || blockers.length) issues.push({ type: 'operation', ids: [item.id, ...blockers.map(other => other.id)],
        text: isSofa(item) ? `${item.name} needs ${SOFA_LEGROOM} cm of clear legroom across the front of its seats.`
          : `${item.name} needs clear space across its front to open and use it.` });
    }
    const target = chairTarget(item, project.furniture);
    if (target && !facesTable(item, target)) issues.push({ type: 'facing', ids: [item.id, target.id],
      text: `${item.name} must face the usable side of ${target.name}.` });
  }
  return issues;
}
