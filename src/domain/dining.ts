import type { Furniture, Room } from './model.ts';
import { footprint } from './geometry.ts';
import { rotations, rotationOf } from './rotation.ts';
import { chairPositions, fourSeatDiningAllowed } from './usability.ts';
import { furnitureGap, MIN_FURNITURE_GAP } from './spacing.ts';
import { WALKWAY_WIDTH } from './access.ts';

// A four-chair set uses two seats on each opposite long side.
export function diningSeatingPenalty(table: Furniture, chairs: Furniture[]) {
  if (chairs.length !== 4 || table.width === table.depth) return 0;
  const top = footprint(table), across = top.width >= top.depth;
  const ends = chairs.filter(chair => (rotationOf(chair) % 180 === 90) === across).length;
  return ends;
}

export function diningTableAnchors(room: Room, furniture: Furniture[], width: number, depth: number) {
  const sofas = furniture.filter(item => item.kind === 'sofa');
  const chairs = furniture.filter(item => item.kind === 'chair');
  if (sofas.length < 2 || chairs.length < 4) return [];
  const seatDepth = Math.max(...chairs.map(item => item.depth)) + 15;
  // Keep the sofa's usual 10 cm wall margin as well as the gap to the seats.
  const strip = Math.max(...sofas.map(item => Math.min(item.width, item.depth))) + MIN_FURNITURE_GAP + 10;
  const length = sofas.reduce((sum, item) => sum + Math.max(item.width, item.depth), 0) + (sofas.length - 1) * MIN_FURNITURE_GAP;
  const anchors: { x: number; y: number }[] = [];
  if (room.depth >= length && room.width >= strip + width + seatDepth * 2 + WALKWAY_WIDTH) {
    anchors.push({ x: strip + seatDepth, y: (room.depth - depth) / 2 },
      { x: room.width - strip - seatDepth - width, y: (room.depth - depth) / 2 });
  }
  if (room.width >= length && room.depth >= strip + depth + seatDepth * 2 + WALKWAY_WIDTH) {
    anchors.push({ x: (room.width - width) / 2, y: strip + seatDepth },
      { x: (room.width - width) / 2, y: room.depth - strip - seatDepth - depth });
  }
  return anchors;
}

// Seat a matching dining set as a group, so the search does not explore every
// permutation of six identical chairs before moving the table.
export function diningChairGroups(table: Furniture, chairs: Furniture[]): Furniture[][] {
  const chair = chairs[0];
  if (!chair || !chairs.every(other => other.width === chair.width && other.depth === chair.depth)) return [];
  const top = footprint(table);
  const candidates = chairPositions(chair, [table], true);
  const sides = rotations.map(rotation => {
    const seat = candidates.find(item => rotationOf(item) === rotation)!;
    const rect = footprint(seat), horizontal = rotation % 180 === 90;
    const extent = horizontal ? top.depth : top.width;
    const size = horizontal ? rect.depth : rect.width;
    const capacity = Math.max(1, Math.floor((extent + MIN_FURNITURE_GAP) / (size + MIN_FURNITURE_GAP)));
    return candidates.filter(item => rotationOf(item) === rotation && Math.abs(furnitureGap(item, table) - 15) < .001).slice(0, capacity);
  });
  const seats: Furniture[] = [];
  // Fill opposite edges evenly before adding a second chair to an edge.
  for (let row = 0; sides.some(side => row < side.length); row++) for (const side of sides) {
    if (side[row] && seats.length < chairs.length) seats.push(side[row]);
  }
  if (seats.length !== chairs.length) return [];
  const assign = (positions: Furniture[]) => positions.map((seat, index) => ({ ...chairs[index],
    x: seat.x, y: seat.y, rotation: seat.rotation, rotated: seat.rotated }));
  const groups = [assign(seats)];
  if (chairs.length === 4) {
    const direction = (rotationOf(table) + (table.width >= table.depth ? 0 : 90)) % 180;
    const longSides = sides.filter((_, index) => rotations[index] % 180 === direction);
    const extent = Math.max(top.width, top.depth);
    const separation = Math.max(chair.width + MIN_FURNITURE_GAP, extent / 2);
    if (longSides.every(side => side.length >= 2) && separation + chair.width <= extent) {
      const preferred = longSides.flatMap(side => [-1, 1].map(sign => {
        const offset = (extent - chair.width) / 2 + sign * separation / 2;
        return { ...side[0], ...(direction === 0 ? { x: top.x + offset } : { y: top.y + offset }) };
      }));
      groups.unshift(assign(preferred));
    }
  }
  const allSeats = sides.flat();
  // With fewer chairs, try leaving either side open instead of always removing
  // the last seat in the same row. That opening may be the room's walking route.
  if (allSeats.length > chairs.length && allSeats.length <= 10) {
    const choose = (start: number, selected: Furniture[]) => {
      if (selected.length === chairs.length) { groups.push(assign(selected)); return; }
      for (let index = start; index <= allSeats.length - (chairs.length - selected.length); index++) {
        choose(index + 1, [...selected, allSeats[index]]);
      }
    };
    choose(0, []);
  }
  // End seats can shift or pull out slightly to keep a doorway or walking route
  // open. Keep the rest of the group stable while trying each alternative.
  for (let index = 0; index < seats.length; index++) for (const alternative of candidates) {
    if (rotationOf(alternative) !== rotationOf(seats[index])) continue;
    groups.push(assign(seats.map((seat, at) => at === index ? alternative : seat)));
  }
  return groups.filter(group => fourSeatDiningAllowed(table, group))
    .sort((a, b) => diningSeatingPenalty(table, a) - diningSeatingPenalty(table, b));
}
