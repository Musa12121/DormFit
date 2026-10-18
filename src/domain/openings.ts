import type { Furniture, Room, RoomOpening, Wall } from './model.ts';

export const MAX_OPENINGS = 12;
export const walls: Wall[] = ['top', 'right', 'bottom', 'left'];
export const wallLength = (room: Room, wall: Wall) =>
  wall === 'top' || wall === 'bottom' ? room.width : room.depth;

export function getOpenings(room: Room): RoomOpening[] {
  return room.openings ?? [
    { id: 'opening-door', kind: 'door', wall: 'bottom', offset: (room.width - room.door) / 2, width: room.door },
    { id: 'opening-window', kind: 'window', wall: 'top', offset: (room.width - room.window) / 2, width: room.window },
  ];
}

export function openingLabel(room: Room, opening: RoomOpening) {
  const index = getOpenings(room).filter((item) => item.kind === opening.kind).findIndex((item) => item.id === opening.id);
  return `${opening.kind === 'door' ? 'Door' : 'Window'} ${index + 1}`;
}

export function openingSegment(room: Room, opening: RoomOpening) {
  const { wall, offset, width } = opening;
  switch (wall) {
    case 'top': return { x: offset, y: 0, width, depth: 0 };
    case 'bottom': return { x: offset, y: room.depth, width, depth: 0 };
    case 'left': return { x: 0, y: offset, width: 0, depth: width };
    case 'right': return { x: room.width, y: offset, width: 0, depth: width };
  }
}

export function doorClearance(room: Room, opening: RoomOpening) {
  const segment = openingSegment(room, opening);
  return {
    x: segment.x - (opening.wall === 'right' ? opening.width : 0),
    y: segment.y - (opening.wall === 'bottom' ? opening.width : 0),
    width: opening.width,
    depth: opening.width,
  };
}

export function doorZones(room: Room) {
  return getOpenings(room).filter((opening) => opening.kind === 'door').map((opening) => doorClearance(room, opening));
}

// Leave a landing beyond the swing, so opening the door also lets someone enter.
export function entranceZones(room: Room) {
  return getOpenings(room).filter(opening => opening.kind === 'door').map(opening => {
    const swing = doorClearance(room, opening);
    const horizontal = opening.wall === 'top' || opening.wall === 'bottom';
    const extra = Math.min(60, (horizontal ? room.depth : room.width) - opening.width);
    return { x: swing.x - (opening.wall === 'right' ? extra : 0),
      y: swing.y - (opening.wall === 'bottom' ? extra : 0),
      width: swing.width + (horizontal ? 0 : extra), depth: swing.depth + (horizontal ? extra : 0) };
  });
}

export const FLOOR_LAMP_DOOR_BUFFER = 20;
export const TV_DOOR_BUFFER = 20;

// The measured lamp footprint includes its shade, not just its small base.
// Leave an additional buffer around the full swing/landing for fragile lamps.
export function furnitureEntranceZones(room: Room, item: Pick<Furniture, 'kind'>) {
  const margin = item.kind === 'floor-lamp' ? FLOOR_LAMP_DOOR_BUFFER
    : item.kind === 'television' || item.kind === 'tv-stand' ? TV_DOOR_BUFFER : 0;
  return entranceZones(room).map(zone => {
    const x = Math.max(0, zone.x - margin), y = Math.max(0, zone.y - margin);
    return { x, y, width: Math.min(room.width, zone.x + zone.width + margin) - x,
      depth: Math.min(room.depth, zone.y + zone.depth + margin) - y };
  });
}

export function openingsProblem(room: Room): string | null {
  if (room.openings === undefined) return null;
  if (!Array.isArray(room.openings) || room.openings.length > MAX_OPENINGS) return 'Use at most 12 doors and windows.';
  const ids = new Set<string>();
  for (const opening of room.openings) {
    if (!opening || typeof opening.id !== 'string' || !/^opening-[a-zA-Z0-9-]{1,60}$/.test(opening.id) || ids.has(opening.id)) return 'Opening IDs must be unique.';
    ids.add(opening.id);
    if (!['door', 'window'].includes(opening.kind) || !walls.includes(opening.wall)) return 'Choose a valid opening type and wall.';
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width) || opening.offset < 0 || opening.width < 60 || opening.width > wallLength(room, opening.wall) || opening.offset + opening.width > wallLength(room, opening.wall)) return 'Each opening must fit on its wall and be at least 60 cm wide.';
    if (opening.kind === 'door' && opening.width > Math.min(140, room.width, room.depth)) return 'Door width must be between 60 and 140 cm and fit the room.';
  }
  for (let i = 0; i < room.openings.length; i++) {
    for (let j = i + 1; j < room.openings.length; j++) {
      const a = room.openings[i], b = room.openings[j];
      if (a.wall === b.wall && a.offset < b.offset + b.width && a.offset + a.width > b.offset) return 'Doors and windows on the same wall must not overlap.';
    }
  }
  return null;
}

// Keep openings on the wall when room dimensions are reduced. Report overlaps separately.
export function fitOpenings(room: Room): Room {
  if (!room.openings) return room;
  return { ...room, openings: room.openings.map((opening) => {
    const width = Math.min(opening.width, wallLength(room, opening.wall));
    return { ...opening, width, offset: Math.max(0, Math.min(opening.offset, wallLength(room, opening.wall) - width)) };
  }) };
}

// Project a dragged centre point onto the nearest wall with space for this opening.
export function moveOpening(room: Room, id: string, x: number, y: number): Room {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return room;
  const openings = getOpenings(room);
  const item = openings.find((opening) => opening.id === id);
  if (!item) return room;
  const candidates = walls.map((wall) => ({ wall, distance: wall === 'top' ? Math.abs(y)
    : wall === 'bottom' ? Math.abs(room.depth - y) : wall === 'left' ? Math.abs(x) : Math.abs(room.width - x) }))
    .sort((a, b) => a.distance - b.distance);
  for (const { wall } of candidates) {
    const length = wallLength(room, wall);
    if (item.width > length) continue;
    const occupied = openings.filter((opening) => opening.id !== id && opening.wall === wall).sort((a, b) => a.offset - b.offset);
    const gaps: [number, number][] = [];
    let start = 0;
    for (const opening of occupied) {
      gaps.push([start, opening.offset]);
      start = opening.offset + opening.width;
    }
    gaps.push([start, length]);
    const desired = (wall === 'top' || wall === 'bottom' ? x : y) - item.width / 2;
    const offsets = gaps.filter(([from, to]) => to - from >= item.width)
      .map(([from, to]) => Math.max(from, Math.min(to - item.width, Math.round(desired / 5) * 5)))
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
    if (offsets.length) return { ...room, openings: openings.map((opening) => opening.id === id ? { ...opening, wall, offset: offsets[0] } : opening) };
  }
  return room;
}
