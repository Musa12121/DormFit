import type { Furniture, Project, Room, Rotation } from './model.ts';
import { footprint, overlaps } from './geometry.ts';
import { furniturePoint, orientation, rotationOf } from './rotation.ts';
import { furnitureEntranceZones } from './openings.ts';
import { placementConflict } from './spacing.ts';
import { inaccessibleFurniture } from './access.ts';
import { wallTvPositions } from './mounting.ts';
import { isWallMounted } from './model.ts';
import { canWatchFromSofa, functionalPlacementAllowed, isSofa, usabilityIssues } from './usability.ts';

export const isTelevision = (item: Furniture) => item.kind === 'television' || item.kind === 'tv-stand';
const groupCache = new WeakMap<Room, Map<string, Furniture[][]>>();

export function loungeGroups(tv: Furniture, seats: Furniture[], room: Room, patterns = false): Furniture[][] {
  if (!seats.length) return [];
  let cache = groupCache.get(room);
  if (!cache) { cache = new Map(); groupCache.set(room, cache); }
  const key = JSON.stringify([patterns, room.width, room.depth, room.openings ?? [room.door, room.window], tv.id, tv.kind, tv.x, tv.y, tv.width, tv.depth, rotationOf(tv),
    seats.map(item => [item.id, item.kind, item.width, item.depth, item.owner])]);
  const cached = cache.get(key);
  if (cached) return cached;
  const rotation = ((rotationOf(tv) + 180) % 360) as Rotation;
  const horizontal = rotation % 180 === 0;
  const length = horizontal ? room.width : room.depth;
  const depth = Math.max(...seats.map(item => item.depth));
  const front = furniturePoint(tv, tv.width / 2, tv.depth);
  const groups: Furniture[][] = [];
  for (const gap of [60, 30]) {
    const span = seats.reduce((sum, item) => sum + item.width, 0) + gap * (seats.length - 1);
    if (span > length - 20) continue;
    const centre = horizontal ? front[0] : front[1];
    const starts = [...new Set([Math.max(10, Math.min(length - span - 10, centre - span / 2)),
      (length - span) / 2, 10, length - span - 10])];
    const farWall = rotation === 0 || rotation === 270 ? 10 : (horizontal ? room.depth : room.width) - depth - 10;
    const rows = [farWall, ...[60, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280].map(distance => {
      const screen = horizontal ? front[1] : front[0];
      return rotation === 0 || rotation === 270 ? screen - distance - depth : screen + distance;
    })];
    for (const start of starts) for (const row of rows) {
      let offset = start;
      groups.push(seats.map(item => {
        const position = { ...item, ...orientation(rotation), x: horizontal ? offset : row, y: horizontal ? row : offset };
        offset += item.width + gap;
        return position;
      }));
    }
  }
  // Offset one sofa into the room to create a staggered lounge when doors
  // prevent a corner group. Its sight lines must still clear the other sofa.
  if (patterns && seats.length === 2) for (const group of [...groups]) {
    for (const index of [0, 1]) for (const shift of [90]) {
      groups.push(group.map((item, at) => at !== index ? item : { ...item,
        x: item.x + (horizontal ? 0 : rotation === 270 ? shift : -shift),
        y: item.y + (horizontal ? rotation === 0 ? shift : -shift : 0) }));
    }
  }
  // A second seating pattern: two perpendicular sofas sharing a screen.
  // Check every seat before pairing them; a sofa beside the TV is not a
  // usable corner arrangement simply because its footprint fits.
  if (patterns && seats.length === 2) {
    const positions = seats.map(seat => {
      const candidates: Furniture[] = [];
      for (const facing of [rotation, ((rotation + 90) % 360) as Rotation, ((rotation + 270) % 360) as Rotation]) {
        const width = facing % 180 ? seat.depth : seat.width;
        const height = facing % 180 ? seat.width : seat.depth;
        const axis = (limit: number) => [...new Set([0, 10, limit, limit - 10, limit / 2,
          ...Array.from({ length: Math.max(0, Math.floor(limit / Math.max(20, limit / 16))) }, (_, i) => 10 + i * Math.max(20, limit / 16))])]
          .filter(value => value >= 0 && value <= limit);
        for (const x of axis(room.width - width)) for (const y of axis(room.depth - height)) {
          const candidate = { ...seat, ...orientation(facing), x, y };
          if (!furnitureEntranceZones(room, candidate).some(zone => overlaps(footprint(candidate), zone))
            && !placementConflict(candidate, tv) && canWatchFromSofa(candidate, tv, [candidate, tv])) candidates.push(candidate);
        }
      }
      return candidates.filter((_, index) => index % Math.max(1, Math.ceil(candidates.length / 48)) === 0);
    });
    for (const a of positions[0]) for (const b of positions[1]) {
      if (rotationOf(a) % 180 === rotationOf(b) % 180 || placementConflict(a, b)) continue;
      const furniture = [tv, a, b];
      if (canWatchFromSofa(a, tv, furniture) && canWatchFromSofa(b, tv, furniture)) groups.push([a, b]);
    }
  }
  // Reject impossible screen/seating groups once. Check complete walking
  // routes when the rest of the room is attached.
  const usable = groups.filter(group => {
    const furniture = [tv, ...group];
    return group.every(item => {
      const rect = footprint(item);
      return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= room.width && rect.y + rect.depth <= room.depth
        && !furnitureEntranceZones(room, item).some(zone => overlaps(rect, zone))
        && !furniture.some(other => other.id !== item.id && placementConflict(item, other))
        && functionalPlacementAllowed(item, room, furniture.filter(other => other.id !== item.id));
    });
  });
  cache.set(key, usable);
  return usable;
}

export function attachLounge(tv: Furniture, seats: Furniture[], room: Room, others: Furniture[], workDepth = 0,
  score?: (items: Furniture[]) => number) {
  const seatIds = new Set(seats.map(item => item.id));
  const base = [...others.filter(item => item.id !== tv.id && !seatIds.has(item.id)), tv];
  const groups = loungeGroups(tv, seats, room);
  const ordered = score ? groups.map(group => ({ group, rank: score([tv, ...group]) }))
    .filter(entry => Number.isFinite(entry.rank)).sort((a, b) => a.rank - b.rank).map(entry => entry.group) : groups;
  for (const group of ordered) {
    const furniture = [...base];
    if (!group.every(item => {
      const rect = footprint(item);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > room.width || rect.y + rect.depth > room.depth
        || furnitureEntranceZones(room, item).some(zone => overlaps(rect, zone))
        || furniture.some(other => placementConflict(item, other))
        || !functionalPlacementAllowed(item, room, furniture, workDepth)) return false;
      furniture.push(item); return true;
    })) continue;
    if (!usabilityIssues({ room, furniture }).length && !inaccessibleFurniture({ room, furniture }).length) return group;
  }
  return null;
}

function televisionCandidates(tv: Furniture, room: Room, others: Furniture[], proposed = false, patterns = false) {
  const candidates: Furniture[] = isWallMounted(tv) ? wallTvPositions(tv, room, others) : [];
  if (!isWallMounted(tv)) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const horizontal = rotation % 180 === 0;
    const length = horizontal ? room.width : room.depth;
    const maximum = length - tv.width;
    if (maximum < 0) continue;
    for (const offset of [...new Set([...(proposed ? [horizontal ? tv.x : tv.y] : []), maximum / 2, 10, maximum - 10,
      ...(patterns ? Array.from({ length: Math.floor(maximum / Math.max(40, maximum / 16)) + 1 }, (_, index) => index * Math.max(40, maximum / 16)) : []), ...others.flatMap(item => {
      const rect = footprint(item);
      return [horizontal ? rect.x : rect.y, (horizontal ? rect.x + rect.width : rect.y + rect.depth) - tv.width];
    })])]) {
      candidates.push({ ...tv, ...orientation(rotation),
        x: horizontal ? offset : rotation === 90 ? room.width - tv.depth : 0,
        y: horizontal ? rotation === 180 ? room.depth - tv.depth : 0 : offset });
    }
  }
  return candidates;
}

// Build room-level seating patterns once, then fit the dining area around
// them. Rebuilding the lounge for each chair permutation is both slow and
// biased toward the same first feasible arrangement.
export function livingRoomGroups(tv: Furniture, seats: Furniture[], room: Room) {
  const groups: Furniture[][] = [];
  for (const candidate of televisionCandidates(tv, room, [], false, true)) {
    if (furnitureEntranceZones(room, candidate).some(zone => overlaps(footprint(candidate), zone))) continue;
    for (const group of loungeGroups(candidate, seats, room, true)) {
      const furniture = [candidate, ...group];
      if (!usabilityIssues({ room, furniture }).length) groups.push(furniture);
    }
  }
  return groups;
}

export function findLoungeGroup(tv: Furniture, seats: Furniture[], room: Room, others: Furniture[], workDepth = 0,
  score?: (items: Furniture[]) => number) {
  const candidates = televisionCandidates(tv, room, others, !!score);
  if (score) candidates.sort((a, b) => score([a]) - score([b]));
  for (const candidate of candidates) {
    const rect = footprint(candidate);
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > room.width || rect.y + rect.depth > room.depth
      || furnitureEntranceZones(room, candidate).some(zone => overlaps(rect, zone))
      || others.some(other => placementConflict(candidate, other))
      || !functionalPlacementAllowed(candidate, room, others, workDepth)) continue;
    const group = attachLounge(candidate, seats, room, others, workDepth, score);
    if (group) return [candidate, ...group];
  }
  return null;
}

// Centre rugs in the shared space in front of the seats, aligned with the sofa.
// A rug referenced in an AI placement condition keeps its requested position.
export function alignSeatingRugs(project: Project, protectedIds = new Set<string>()): Project {
  const sofas = project.furniture.filter(isSofa);
  if (!sofas.length) return project;
  const televisions = project.furniture.filter(isTelevision);
  const tv = televisions.find(item => sofas.every(sofa => canWatchFromSofa(sofa, item, project.furniture)));
  const fronts = sofas.flatMap(sofa => [furniturePoint(sofa, 0, sofa.depth), furniturePoint(sofa, sofa.width, sofa.depth)]);
  if (tv) fronts.push(furniturePoint(tv, tv.width / 2, tv.depth));
  const centre = [0, 1].map(axis => (Math.min(...fronts.map(point => point[axis])) + Math.max(...fronts.map(point => point[axis]))) / 2);
  return { ...project, furniture: project.furniture.map(item => {
    if (item.kind !== 'rug' || protectedIds.has(item.id)) return item;
    const aligned = { ...item, ...orientation(rotationOf(sofas[0])) };
    const rect = footprint(aligned);
    return { ...aligned, x: Math.max(0, Math.min(project.room.width - rect.width, centre[0] - rect.width / 2)),
      y: Math.max(0, Math.min(project.room.depth - rect.depth, centre[1] - rect.depth / 2)) };
  }) };
}
