import type { Furniture, Room, Wall } from './model.ts';
import { isBed, isWallMounted } from './model.ts';
import { footprint, overlaps } from './geometry.ts';
import { furnitureEntranceZones, getOpenings } from './openings.ts';
import { axisPositions } from './positions.ts';
import { orientation, rotationOf, rotations } from './rotation.ts';
import { functionalPlacementAllowed, tvViewingScore } from './usability.ts';

const walls: Record<number, Wall> = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' };

export function validWallMount(item: Furniture, room: Room) {
  const rect = footprint(item), rotation = rotationOf(item), wall = walls[rotation];
  const backGap = rotation === 0 ? rect.y : rotation === 90 ? room.width - rect.x - rect.width
    : rotation === 180 ? room.depth - rect.y - rect.depth : rect.x;
  if (Math.abs(backGap) > .001 || rect.x < 0 || rect.y < 0
    || rect.x + rect.width > room.width || rect.y + rect.depth > room.depth) return false;
  if (furnitureEntranceZones(room, item).some(zone => overlaps(rect, zone))) return false;
  const start = wall === 'top' || wall === 'bottom' ? rect.x : rect.y;
  const end = start + (wall === 'top' || wall === 'bottom' ? rect.width : rect.depth);
  return !getOpenings(room).some(opening => opening.wall === wall
    && start < opening.offset + opening.width && end > opening.offset);
}

// Face into the room and reserve an uninterrupted wall segment. Floor furniture
// can sit underneath a mounted screen; other mounted screens cannot overlap it.
export function wallTvPositions(item: Furniture, room: Room, others: Furniture[] = []): Furniture[] {
  const positions: Furniture[] = [];
  for (const rotation of rotations) {
    const sideways = rotation % 180 === 90;
    const width = sideways ? item.depth : item.width;
    const depth = sideways ? item.width : item.depth;
    if (width > room.width || depth > room.depth) continue;
    const wall = walls[rotation];
    const horizontal = !sideways;
    const length = horizontal ? width : depth;
    const neighbours = others.filter(other => other.id !== item.id && isWallMounted(other)).map(footprint);
    const anchors = getOpenings(room).filter(opening => opening.wall === wall)
      .flatMap(opening => [opening.offset - length, opening.offset + opening.width]);
    anchors.push(...others.filter(other => isBed(other.kind)).map(other => {
      const bed = footprint(other);
      return (horizontal ? bed.x + bed.width / 2 : bed.y + bed.depth / 2) - length / 2;
    }));
    anchors.push(horizontal ? item.x : item.y, ...neighbours.flatMap(rect => horizontal
      ? [rect.x - length, rect.x + rect.width] : [rect.y - length, rect.y + rect.depth]));
    for (const offset of axisPositions((horizontal ? room.width : room.depth) - length, anchors)) {
      const candidate = { ...item, wallMounted: true, ...orientation(rotation),
        x: horizontal ? offset : rotation === 90 ? room.width - width : 0,
        y: horizontal ? rotation === 180 ? room.depth - depth : 0 : offset };
      if (validWallMount(candidate, room) && functionalPlacementAllowed(candidate, room, others)
        && !neighbours.some(rect => overlaps(footprint(candidate), rect))) positions.push(candidate);
    }
  }
  return positions.sort((a, b) => tvViewingScore(a, others) - tvViewingScore(b, others) ||
    (Math.hypot(a.x - item.x, a.y - item.y) + (rotationOf(a) === rotationOf(item) ? 0 : 20))
    - (Math.hypot(b.x - item.x, b.y - item.y) + (rotationOf(b) === rotationOf(item) ? 0 : 20)));
}

export function rotateWallTv(item: Furniture, room: Room, others: Furniture[] = []) {
  const positions = wallTvPositions(item, room, others);
  for (let turn = 1; turn <= 4; turn++) {
    const next = positions.find(position => rotationOf(position) === (rotationOf(item) + turn * 90) % 360);
    if (next) return next;
  }
  return item;
}
