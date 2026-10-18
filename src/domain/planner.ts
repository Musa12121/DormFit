import type { Furniture, Project, Room } from './model.ts';
import { isBed, isWallMounted, occupiesFloor } from './model.ts';
import { axisPositions } from './positions.ts';
import { FLOOR_LAMP_DOOR_BUFFER, TV_DOOR_BUFFER, furnitureEntranceZones, getOpenings, openingSegment } from './openings.ts';
import { footprint, overlaps } from './geometry.ts';
import { inaccessibleFurniture } from './access.ts';
import { orientation, rotations, rotationOf } from './rotation.ts';
import { diningTvPenalty, furnitureGap, MIN_FURNITURE_GAP, minimumFurnitureGap, PREFERRED_FURNITURE_GAP, tooClose } from './spacing.ts';
import { validWallMount, wallTvPositions } from './mounting.ts';
import { diningChairGroups, diningSeatingPenalty, diningTableAnchors } from './dining.ts';
import { alignSeatingRugs, attachLounge, findLoungeGroup, isTelevision, livingRoomGroups } from './lounge.ts';
import { bedsidePositions, chairPositions, chairTarget, facesTable, functionalPlacementAllowed, isChair, isSofa, usabilityIssues, workspaceDepth } from './usability.ts';
export { footprint, overlaps } from './geometry.ts';

export function outside(item: Furniture, room: Room) {
  const r = footprint(item);
  return r.x < 0 || r.y < 0 || r.x + r.width > room.width || r.y + r.depth > room.depth;
}
export function clampItem(item: Furniture, room: Room): Furniture {
  const r = footprint(item);
  return {
    ...item,
    x: Math.max(0, Math.min(item.x, room.width - r.width)),
    y: Math.max(0, Math.min(item.y, room.depth - r.depth)),
  };
}
export interface PlanIssue {
  type: 'overlap' | 'outside' | 'door' | 'access' | 'spacing' | 'mount' | 'operation' | 'facing' | 'bedside' | 'view';
  ids: string[];
  text: string;
}
export function analyze(project: Project) {
  const solid = project.furniture.filter(occupiesFloor);
  const issues: PlanIssue[] = [];
  issues.push(...usabilityIssues(project));
  const mounted = project.furniture.filter(isWallMounted);
  for (const [index, item] of mounted.entries()) {
    if (!validWallMount(item, project.room)) issues.push({ type: 'mount', ids: [item.id],
      text: `${item.name} needs a clear wall segment away from doors and windows.` });
    for (const other of mounted.slice(index + 1)) {
      if (overlaps(footprint(item), footprint(other))) issues.push({ type: 'overlap', ids: [item.id, other.id],
        text: `${item.name} and ${other.name} overlap.` });
    }
  }
  for (const item of project.furniture) {
    if (outside(item, project.room))
      issues.push({
        type: 'outside',
        ids: [item.id],
        text: `${item.name} extends outside the room.`,
      });
  }
  for (let i = 0; i < solid.length; i++) {
    const item = solid[i];
    if (furnitureEntranceZones(project.room, item).some((zone) => overlaps(footprint(item), zone)))
      issues.push({
        type: 'door',
        ids: [item.id],
        text: item.kind === 'floor-lamp' || item.kind === 'tv-stand'
          ? `${item.name} needs ${item.kind === 'floor-lamp' ? FLOOR_LAMP_DOOR_BUFFER : TV_DOOR_BUFFER} cm of clearance from the door swing and entrance.`
          : `${item.name} blocks the door or entrance landing.`,
      });
    for (let j = i + 1; j < solid.length; j++) {
      if (overlaps(footprint(item), footprint(solid[j])))
        issues.push({
          type: 'overlap',
          ids: [item.id, solid[j].id],
          text: `${item.name} and ${solid[j].name} overlap.`,
        });
      else if (tooClose(item, solid[j]))
        issues.push({
          type: 'spacing',
          ids: [item.id, solid[j].id],
          text: `${item.name} and ${solid[j].name} need at least ${minimumFurnitureGap(item, solid[j])} cm of space between them.`,
        });
    }
  }
  if (!issues.length) {
    const blocked = inaccessibleFurniture(project);
    if (blocked.length) issues.push({ type: 'access', ids: blocked,
      text: 'Furniture blocks a 60 cm walking route from the entrance.' });
  }
  // Exact rectangle union, clipped to the room; overlap never counts twice.
  const rectangles = solid
    .map(footprint)
    .map((r) => ({
      left: Math.max(0, r.x),
      right: Math.min(project.room.width, r.x + r.width),
      top: Math.max(0, r.y),
      bottom: Math.min(project.room.depth, r.y + r.depth),
    }))
    .filter((r) => r.left < r.right && r.top < r.bottom);
  const edges = [...new Set(rectangles.flatMap((r) => [r.left, r.right]))].sort((a, b) => a - b);
  let used = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const spans = rectangles
      .filter((r) => r.left < edges[i + 1] && r.right > edges[i])
      .map((r) => [r.top, r.bottom])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0,
      end = -Infinity;
    for (const [start, bottom] of spans) {
      if (bottom > end) covered += bottom - Math.max(start, end);
      end = Math.max(end, bottom);
    }
    used += covered * (edges[i + 1] - edges[i]);
  }
  const total = project.room.width * project.room.depth;
  const free = Math.max(0, total - used);
  return {
    issues,
    total: total / 10000,
    free: free / 10000,
    occupied: used / 10000,
    freePercent: Math.round((free / total) * 100),
  };
}

export interface LayoutOption {
  id: string;
  name: string;
  description: string;
  project: Project;
  issueCount: number;
}

type LayoutStyle = 'balanced' | 'daylight' | 'open';
const WALL_MARGIN = 10;
const layoutRotation = (item: Furniture) => item.kind === 'dining-table' ? rotationOf(item) % 180 : rotationOf(item);

// Compare physical arrangements, ignoring interchangeable chair/sofa IDs.
// A small nudge or a rug change does not make a new room arrangement.
export function similarLayouts(a: Project, b: Project) {
  // In a living room the seating and screen define the arrangement. Moving
  // only the dining table must not turn the same lounge into another option.
  const living = [a, b].every(project => project.furniture.some(isTelevision) && project.furniture.some(isSofa));
  const anchors = (project: Project) => project.furniture.filter(item => living
    ? isTelevision(item) || isSofa(item) : item.kind !== 'rug' && !isChair(item));
  const left = anchors(a), remaining = [...anchors(b)];
  if (left.length !== remaining.length) return false;
  for (const item of left) {
    const rect = footprint(item);
    const index = remaining.findIndex(other => {
      const target = footprint(other);
      return item.kind === other.kind && item.width === other.width && item.depth === other.depth
        && layoutRotation(item) === layoutRotation(other)
        && Math.hypot(rect.x + rect.width / 2 - target.x - target.width / 2,
          rect.y + rect.depth / 2 - target.y - target.depth / 2) < 60;
    });
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  // Chair-only rooms still need distinct physical seating arrangements.
  if (!left.length) return JSON.stringify(a.furniture.map(item => [item.kind, item.x, item.y, rotationOf(item)]).sort())
    === JSON.stringify(b.furniture.map(item => [item.kind, item.x, item.y, rotationOf(item)]).sort());
  return true;
}

function repetitionScore(item: Furniture, previous: Project[]) {
  if (isChair(item) || item.kind === 'rug') return 0;
  return previous.reduce((score, project) => {
    const matches = project.furniture.filter(other => other.kind === item.kind && layoutRotation(other) === layoutRotation(item));
    const distance = Math.min(...matches.map(other => Math.hypot(item.x - other.x, item.y - other.y)));
    return score + Math.max(0, 120 - distance) * 100;
  }, 0);
}

function canPlace(item: Furniture, room: Room, placed: Furniture[], workDepth = 0) {
  if (outside(item, room) || furnitureEntranceZones(room, item).some((zone) => overlaps(footprint(item), zone))) return false;
  return functionalPlacementAllowed(item, room, placed, workDepth) && !placed.some(
    (other) => tooClose(item, other),
  );
}

function attachBedsides(bed: Furniture, tables: Furniture[], room: Room, placed: Furniture[], workDepth: number) {
  const group = [...placed, bed];
  const attached: Furniture[] = [];
  for (const table of tables) {
    const position = bedsidePositions(table, [bed]).find(candidate => canPlace(candidate, room, group, workDepth)
      && !inaccessibleFurniture({ room, furniture: [...group, candidate] }).length);
    if (!position) return null;
    attached.push(position); group.push(position);
  }
  return attached;
}

function attachDining(table: Furniture, chairs: Furniture[], room: Room, placed: Furniture[], workDepth: number, context: Furniture[] = [], cache?: Map<string, Furniture[]>, score?: (items: Furniture[]) => number) {
  const key = JSON.stringify([table.id, table.x, table.y, rotationOf(table) % 180, chairs.length,
    placed.map(item => [item.id, item.x, item.y, rotationOf(item)])]);
  const cached = cache?.get(key);
  if (cached) return cached;
  const remember = (group: Furniture[]) => { cache?.set(key, group); return group; };
  const televisions = context.filter(isTelevision), sofas = context.filter(item => isSofa(item) && !placed.some(other => other.id === item.id));
  for (let count = chairs.length; count >= (chairs.length === 4 ? 4 : 1); count--) for (const seats of diningChairGroups(table, chairs.slice(0, count))) {
    const group = [...placed, table];
    if (!seats.every(seat => {
      if (!canPlace(seat, room, group, workDepth)) return false;
      group.push(seat); return true;
    })) continue;
    if (usabilityIssues({ room, furniture: group }).length || inaccessibleFurniture({ room, furniture: group }).length) continue;
    if (televisions.length === 1 && sofas.length) {
      const lounge = findLoungeGroup(televisions[0], sofas, room, group, workDepth, score);
      if (!lounge) continue;
      return remember([...seats, ...lounge]);
    }
    return remember(seats);
  }
  return remember([]);
}

// A lower score is better. Each style favours a different, easy-to-explain position.
function positionScore(item: Furniture, room: Room, style: LayoutStyle, index: number) {
  const rect = footprint(item);
  const rightGap = room.width - rect.x - rect.width;
  const bottomGap = room.depth - rect.y - rect.depth;
  const wallDistance = Math.min(rect.x, rect.y, rightGap, bottomGap);
  const sideDistance = index % 2 === 0 ? rect.x : rightGap;
  let score = wallDistance * 4 + sideDistance * 0.2;
  // Keep the back/head near a wall and the front facing into the room.
  const backGap = rotationOf(item) === 0 ? rect.y : rotationOf(item) === 90 ? rightGap
    : rotationOf(item) === 180 ? bottomGap : rect.x;
  score += backGap * 0.3;

  if (style === 'daylight') {
    const windows = getOpenings(room).filter((opening) => opening.kind === 'window').map((opening) => openingSegment(room, opening));
    const windowDistance = windows.length ? Math.min(...windows.map((window) => Math.hypot(
      Math.max(window.x - rect.x - rect.width, rect.x - window.x - window.width, 0),
      Math.max(window.y - rect.y - rect.depth, rect.y - window.y - window.depth, 0),
    ))) : wallDistance;
    score += item.kind === 'desk' || item.kind === 'dining-table' ? windowDistance * 3 : isBed(item.kind) ? bottomGap : rect.y * 0.2;
  } else if (style === 'open') {
    // Prefer long furniture along the top/bottom walls to keep the middle open.
    score += Math.min(rect.y, bottomGap) * 2;
    if (isBed(item.kind) && !item.rotated) score += 30;
  } else {
    // Separate the bed area at the top from desks toward the bottom.
    score += item.kind === 'dining-table' ? Math.abs(rect.y + rect.depth / 2 - room.depth / 2) * 2
      : item.kind === 'desk' ? bottomGap * 2 : rect.y;
  }
  return score;
}

function findPosition(
  item: Furniture,
  room: Room,
  placed: Furniture[],
  style: LayoutStyle,
  index: number,
  crowdingWeight = 6,
  firstRotation?: Furniture['rotation'],
  workDepth = 0,
  bedsides: Furniture[] = [],
  diningChairs: Furniture[] = [],
  allFurniture: Furniture[] = placed,
  loungeSeats: Furniture[] = [],
  diningCache?: Map<string, Furniture[]>,
  previous: Project[] = [],
  loungeScore?: (items: Furniture[]) => number,
) {
  const candidates: { item: Furniture; score: number }[] = [];
  if (item.kind === 'nightstand' && placed.some(other => isBed(other.kind))) {
    return bedsidePositions(item, placed).find(candidate => canPlace(candidate, room, placed, workDepth)
      && !inaccessibleFurniture({ room, furniture: [...placed, candidate] }).length) ?? null;
  }
  if (isChair(item) && placed.some(other => other.kind === 'desk' || other.kind === 'vanity' || (item.kind === 'chair' && other.kind === 'dining-table'))) {
    return chairPositions(item, placed).find(candidate => {
      const target = chairTarget(candidate, placed);
      return target && facesTable(candidate, target) && canPlace(candidate, room, placed, workDepth)
        && !inaccessibleFurniture({ room, furniture: [...placed, candidate] }).length;
    }) ?? null;
  }

  for (const rotation of firstRotation === undefined ? rotations : [firstRotation]) {
    const sideways = rotation % 180 === 90;
    const width = sideways ? item.depth : item.width;
    const depth = sideways ? item.width : item.depth;
    const reserveLounge = diningChairs.length && !placed.some(isSofa);
    const zones = reserveLounge ? diningTableAnchors(room, allFurniture, width, depth) : [];
    const hasZones = reserveLounge && (diningTableAnchors(room, allFurniture, item.width, item.depth).length
      || diningTableAnchors(room, allFurniture, item.depth, item.width).length);
    const rectangles = placed.filter(occupiesFloor).map(footprint);
    const margin = isTelevision(item) ? 0 : WALL_MARGIN;
    const xs = axisPositions(room.width - width - margin,
      [...zones.map(zone => zone.x), ...rectangles.flatMap((r) => [MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP]
        .flatMap((gap) => [r.x - width - gap, r.x + r.width + gap]))], margin);
    const ys = axisPositions(room.depth - depth - margin,
      [...zones.map(zone => zone.y), ...rectangles.flatMap((r) => [MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP]
        .flatMap((gap) => [r.y - depth - gap, r.y + r.depth + gap]))], margin);
    for (const x of xs) {
      for (const y of ys) {
        const candidate = { ...item, x, y, ...orientation(rotation) };
        if (!canPlace(candidate, room, placed, workDepth)) continue;
        const crowding = placed.filter(occupiesFloor)
          .reduce((sum, other) => sum + Math.max(0, PREFERRED_FURNITURE_GAP - furnitureGap(candidate, other)), 0);
        const zoning = hasZones ? zones.length ? Math.min(...zones.map((zone, at) => Math.hypot(x - zone.x, y - zone.y) * 10 + at * 100)) : 10000 : 0;
        const seatingMargin = diningChairs.length >= 4 ? [x, y, room.width - x - width, room.depth - y - depth]
          .reduce((sum, gap) => sum + Math.max(0, 60 - gap) * 20, 0) : 0;
        const score = positionScore(candidate, room, style, index) + crowding * crowdingWeight + zoning + seatingMargin
          + (diningChairs.length ? diningTvPenalty([...placed, candidate]) * 30 : 0)
          + repetitionScore(candidate, previous);
        candidates.push({ item: candidate, score });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  let bestDining: Furniture | null = null;
  let mostSeats = 0;
  let bestDiningQuality = Infinity;
  let additionalDiningCandidates = 0;
  const inspectedDining: Furniture[] = [];
  // Adding solid furniture cannot reopen a passage: preserve access at each step.
  for (const { item: candidate } of candidates.slice(0, diningChairs.length === 4 ? 512 : 128)) {
    if (bedsides.length && !attachBedsides(candidate, bedsides, room, placed, workDepth)) continue;
    if (diningChairs.length) {
      // A first feasible partial set need not be the best one. Examine a bounded
      // neighbourhood in score order before omitting requested chairs.
      if (bestDining) {
        if (inspectedDining.some(other => rotationOf(other) % 180 === rotationOf(candidate) % 180
          && Math.hypot(other.x - candidate.x, other.y - candidate.y) < 30)) continue;
        if (++additionalDiningCandidates > (diningChairs.length === 4 ? 16 : 12)) break;
      }
      inspectedDining.push(candidate);
      const group = attachDining(candidate, diningChairs, room, placed, workDepth, allFurniture, diningCache, loungeScore);
      const count = group.filter(item => item.kind === 'chair').length;
      // attachDining already checks the complete group and its walking routes.
      if (!count) continue;
      const seating = diningSeatingPenalty(candidate, group.filter(item => item.kind === 'chair'));
      const tvCrowding = diningTvPenalty([...placed, candidate, ...group]);
      const quality = seating * 1000 + tvCrowding;
      if (count > mostSeats || (count === mostSeats && quality < bestDiningQuality)) {
        bestDining = candidate; mostSeats = count; bestDiningQuality = quality;
      }
      if (count === diningChairs.length && seating === 0 && tvCrowding === 0) return candidate;
      continue;
    }
    if (loungeSeats.length && !attachLounge(candidate, loungeSeats, room, placed, workDepth, loungeScore)) continue;
    if (!inaccessibleFurniture({ room, furniture: [...placed, candidate] }).length) return candidate;
  }
  return bestDining;
}

export function generateLayouts(project: Project): LayoutOption[] {
  if (project.furniture.length === 0) return [];
  const previous: Project[] = [];
  const dining = project.furniture.some(item => item.kind === 'dining-table');
  const working = project.furniture.some(item => item.kind === 'desk');
  const livingDining = dining && project.furniture.some(isSofa) && !project.furniture.some(item => isBed(item.kind));
  const styles: { id: LayoutStyle; name: string; description: string }[] = [
    { id: 'balanced', name: livingDining ? 'Living and dining zones' : 'Balanced room', description: livingDining ? 'Separate seating and dining areas' : 'Separate sleeping and working areas' },
    { id: 'daylight', name: dining && !working ? 'Daylight dining area' : 'Daylight workspace', description: dining && !working ? 'Dining table closer to a window' : 'Desks closer to the window' },
    { id: 'open', name: 'Open centre', description: 'Furniture along the walls' },
  ];

  const televisions = project.furniture.filter(isTelevision);
  const sofas = project.furniture.filter(isSofa);
  const tables = project.furniture.filter(item => item.kind === 'dining-table');
  const diningChairs = project.furniture.filter(item => item.kind === 'chair');
  const groupedLiving = televisions.length === 1 && sofas.length > 0 && sofas.length <= 2 && tables.length === 1
    && diningChairs.length > 0 && project.furniture.every(item => isTelevision(item) || isSofa(item)
      || item.kind === 'dining-table' || item.kind === 'chair' || item.kind === 'rug');
  if (groupedLiving) {
    const patterns = livingRoomGroups(televisions[0], sofas, project.room);
    const options: LayoutOption[] = [];
    const signature = (items: Furniture[]) => {
      const seats = items.filter(isSofa);
      const directions = [...new Set(seats.map(rotationOf))].sort();
      const backs = seats.map(item => {
        const rect = footprint(item);
        const back = rotationOf(item) === 0 ? rect.y : rotationOf(item) === 90 ? project.room.width - rect.x - rect.width
          : rotationOf(item) === 180 ? project.room.depth - rect.y - rect.depth : rect.x;
        return back;
      });
      const pattern = new Set(directions.map(rotation => rotation % 180)).size > 1 ? 'corner'
        : Math.max(...backs) - Math.min(...backs) >= 60 ? 'staggered' : Math.min(...backs) >= 60 ? 'floating' : 'wall';
      return `${rotationOf(items.find(isTelevision)!)}:${directions.join(',')}:${pattern}`;
    };
    for (const style of styles) {
      const used = new Set(options.map(option => signature(option.project.furniture)));
      const corner = (items: Furniture[]) => new Set(items.filter(isSofa).map(item => rotationOf(item) % 180)).size > 1;
      const ranked = patterns.filter(items => !used.has(signature(items))
        && !options.some(other => similarLayouts({ ...project, furniture: items }, other.project)))
        .map(items => ({ items, score: (style.id === 'open' && !corner(items) ? 100_000 : 0)
          + (style.id === 'balanced' && corner(items) ? 100_000 : 0)
          + items.reduce((sum, item) => sum + positionScore(item, project.room, style.id, 0), 0) }))
        .sort((a, b) => a.score - b.score);
      let best: LayoutOption | undefined;
      let bestRank = Infinity;
      let tried = 0;
      const searched: Furniture[][] = [];
      for (const { items, score } of ranked) {
        // Sample distinct seating groups, rather than spending the search on
        // many screen nudges of the same group. Keep this work bounded in UI.
        if (searched.some(other => {
          const tv = items.find(isTelevision)!, previousTv = other.find(isTelevision)!;
          return Math.hypot(tv.x - previousTv.x, tv.y - previousTv.y) < 20
            && similarLayouts({ ...project, furniture: items }, { ...project, furniture: other });
        })) continue;
        searched.push(items);
        if (++tried > 36) break;
        const cache = new Map<string, Furniture[]>();
        const table = findPosition(tables[0], project.room, items, style.id, 0, 0, undefined, 0, [], diningChairs, project.furniture, [], cache);
        if (!table) continue;
        const chairs = attachDining(table, diningChairs, project.room, items, 0, project.furniture, cache);
        const omitted = diningChairs.filter(chair => !chairs.some(other => other.id === chair.id));
        const furniture = [...items, table, ...chairs, ...project.furniture.filter(item => item.kind === 'rug')];
        const layout = alignSeatingRugs({ ...project, furniture: project.furniture.flatMap(item => furniture.find(other => other.id === item.id) ?? []),
          omittedChairs: [...(project.omittedChairs ?? []), ...omitted] });
        if (analyze(layout).issues.length) continue;
        // A new seating pattern takes precedence over filling extra seats in
        // a duplicate room. Within that pattern keep as many chairs as fit.
        const rank = score + omitted.length * 2000 + diningSeatingPenalty(table, chairs) * 2000
          + diningTvPenalty(furniture) * 20 + (style.id === 'daylight' ? positionScore(table, project.room, style.id, 0) * 2 : 0);
        const staggered = !corner(items) && signature(items).endsWith(':staggered');
        if (rank < bestRank) { best = { ...style,
          ...(staggered ? { name: 'Staggered lounge', description: 'Offset sofas with separate seating and dining space' }
            : corner(items) ? { description: 'Perpendicular sofas with a clear view of the TV' } : {}),
          project: layout, issueCount: 0 }; bestRank = rank; }
        if (!omitted.length && diningSeatingPenalty(table, chairs) === 0 && diningTvPenalty(furniture) === 0) break;
      }
      if (best) options.push(best);
    }
    if (options.length) return options;
  }

  const options = styles.map((style) => {
    let avoid = previous;
    const diningCache = new Map<string, Furniture[]>();
    const seats = project.furniture.filter(isSofa);
    const loungeScore = (items: Furniture[]) => {
      const complete = items.filter(isSofa).length === seats.length && items.some(isTelevision);
      if (complete && avoid.some(other => similarLayouts({ ...project, furniture: items }, other))) return Infinity;
      const corner = new Set(items.filter(isSofa).map(item => rotationOf(item) % 180)).size > 1;
      return items.reduce((sum, item) => sum + positionScore(item, project.room, style.id, 0)
        + repetitionScore(item, avoid), 0) + (style.id === 'open' && complete && !corner ? 20000 : 0);
    };
    function arrange(crowdingWeight: number, firstRotation?: Furniture['rotation']) {
      const result = structuredClone(project);
      const placed: Furniture[] = [];
      const omitted = [...(project.omittedChairs ?? [])];
      const nightstands = project.furniture.filter(item => item.kind === 'nightstand');
      const diningChairs = project.furniture.filter(item => item.kind === 'dining-table').length === 1
        && !project.furniture.some(item => item.kind === 'desk' || item.kind === 'vanity')
        ? project.furniture.filter(item => item.kind === 'chair') : [];
      let remainingBeds = project.furniture.filter(item => isBed(item.kind)).length;
      const workDepth = workspaceDepth(project.furniture);
      const televisions = project.furniture.filter(isTelevision);
      const loungeSeats = televisions.length ? project.furniture.filter(isSofa) : [];
      // Larger pieces go first; the daylight style gives desks first choice.
      const items = [...project.furniture].sort((a, b) => {
        if (diningChairs.length && (a.kind === 'dining-table') !== (b.kind === 'dining-table')) return a.kind === 'dining-table' ? -1 : 1;
        if (a.kind === 'rug' && b.kind !== 'rug') return 1;
        if (b.kind === 'rug' && a.kind !== 'rug') return -1;
        const phase = (item: Furniture) => isChair(item) ? 3 : isSofa(item) && televisions.length ? 2 : isWallMounted(item) ? 1 : 0;
        if (phase(a) !== phase(b)) return phase(a) - phase(b);
        if (style.id === 'daylight') {
          if (a.kind === 'desk' && b.kind !== 'desk') return -1;
          if (b.kind === 'desk' && a.kind !== 'desk') return 1;
        }
        return b.width * b.depth - a.width * a.depth;
      });

      for (const item of items) {
        if (placed.some(other => other.id === item.id)) continue;
        if (isWallMounted(item)) {
          const seats = loungeSeats.filter(seat => !placed.some(other => other.id === seat.id));
          const candidates = wallTvPositions(item, project.room, placed);
          const position = televisions.length === 1 && seats.length
            ? candidates.sort((a, b) => loungeScore([a]) - loungeScore([b]))
              .find(candidate => attachLounge(candidate, seats, project.room, placed, workDepth, loungeScore)) : candidates[0];
          placed.push(position ?? { ...item });
          if (position && seats.length) placed.push(...(attachLounge(position, seats, project.room, placed, workDepth, loungeScore) ?? []));
          continue;
        }
        if (item.kind === 'rug') {
          const size = footprint(item);
          placed.push(
            clampItem(
              {
                ...item,
                x: (project.room.width - size.width) / 2,
                y: (project.room.depth - size.depth) / 2,
              },
              project.room,
            ),
          );
          continue;
        }
        const index = placed.filter((other) => other.kind === item.kind).length;
        const bedsides = isBed(item.kind) && remainingBeds ? nightstands.splice(0, Math.ceil(nightstands.length / remainingBeds--)) : [];
        const position = findPosition(item, project.room, placed, style.id, index, crowdingWeight,
          placed.length === 0 ? firstRotation : undefined, workDepth, bedsides,
          item.kind === 'dining-table' ? diningChairs : [], project.furniture,
          item.kind === 'tv-stand' && televisions.length === 1 ? loungeSeats : [], diningCache, avoid, loungeScore);
        if (!position && isChair(item)) { omitted.push({ ...item }); continue; }
        // Non-chair furniture is never silently removed.
        placed.push(position ?? { ...item });
        if (position && item.kind === 'tv-stand' && loungeSeats.length) {
          const seats = loungeSeats.filter(seat => !placed.some(other => other.id === seat.id));
          if (seats.length) placed.push(...(attachLounge(position, seats, project.room, placed, workDepth, loungeScore) ?? []));
        }
        if (position && item.kind === 'dining-table' && diningChairs.length) {
          placed.push(...attachDining(position, diningChairs, project.room, placed.filter(other => other.id !== item.id), workDepth, project.furniture, diningCache, loungeScore));
        }
        if (position && bedsides.length) {
          const attached = attachBedsides(position, bedsides, project.room, placed.filter(other => other.id !== item.id), workDepth);
          if (attached) placed.push(...attached);
        }
      }

      result.furniture = project.furniture.map((item) =>
        placed.find((other) => other.id === item.id),
      ).filter((item): item is Furniture => !!item);
      if (omitted.length) result.omittedChairs = omitted;
      const aligned = alignSeatingRugs(result);
      return { ...style, project: aligned, issueCount: analyze(aligned).issues.length };
    }
    const choose = () => {
      const spacious = arrange(6);
      const allChairsFit = (layout: LayoutOption) => (layout.project.omittedChairs?.length ?? 0) === (project.omittedChairs?.length ?? 0);
      const better = (a: LayoutOption, b: LayoutOption) => a.issueCount < b.issueCount || (a.issueCount === b.issueCount
        && (a.project.omittedChairs?.length ?? 0) < (b.project.omittedChairs?.length ?? 0));
      if (!spacious.issueCount && allChairsFit(spacious)) return spacious;
      // Retry with the hard minimum when generous early gaps leave later pieces
      // without a position. Never relax the 30 cm gap or walking access checks.
      const compact = arrange(0);
      if (!compact.issueCount && allChairsFit(compact)) return compact;
      let best = better(compact, spacious) ? compact : spacious;
      // A different first orientation can leave usable wall space for later pieces.
      for (const rotation of rotations) {
        const alternative = arrange(6, rotation);
        if (better(alternative, best)) best = alternative;
        if (!best.issueCount && allChairsFit(best)) break;
      }
      return best;
    };
    let option = choose();
    // Diversity is secondary to safety. Retry without its ranking penalty
    // before concluding that this style cannot furnish the room safely.
    if (option.issueCount && avoid.length) {
      avoid = [];
      diningCache.clear();
      const fallback = choose();
      if (fallback.issueCount < option.issueCount) option = fallback;
    }
    previous.push(option.project);
    return option;
  });
  const feasible = options.some(option => option.issueCount === 0) ? options.filter(option => option.issueCount === 0) : options;
  return feasible.filter((option, index) => !feasible.slice(0, index).some(other => similarLayouts(option.project, other.project)));
}
