import type { Furniture, Project, Room } from './model.ts';
import { isBed } from './model.ts';
import { axisPositions } from './positions.ts';
import { doorZones, getOpenings, openingSegment } from './openings.ts';

export function footprint(item: Furniture) {
  return {
    x: item.x,
    y: item.y,
    width: item.rotated ? item.depth : item.width,
    depth: item.rotated ? item.width : item.depth,
  };
}
export function overlaps(a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y;
}
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
  type: 'overlap' | 'outside' | 'door';
  ids: string[];
  text: string;
}
export function analyze(project: Project) {
  const solid = project.furniture.filter((f) => f.kind !== 'rug');
  const issues: PlanIssue[] = [];
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
    if (doorZones(project.room).some((zone) => overlaps(footprint(item), zone)))
      issues.push({
        type: 'door',
        ids: [item.id],
        text: `${item.name} is in the door opening zone.`,
      });
    for (let j = i + 1; j < solid.length; j++) {
      if (overlaps(footprint(item), footprint(solid[j])))
        issues.push({
          type: 'overlap',
          ids: [item.id, solid[j].id],
          text: `${item.name} and ${solid[j].name} overlap.`,
        });
    }
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

function canPlace(item: Furniture, room: Room, placed: Furniture[]) {
  if (outside(item, room) || doorZones(room).some((zone) => overlaps(footprint(item), zone))) return false;
  return !placed.some(
    (other) => other.kind !== 'rug' && overlaps(footprint(item), footprint(other)),
  );
}

// A lower score is better. Each style favours a different, easy-to-explain position.
function positionScore(item: Furniture, room: Room, style: LayoutStyle, index: number) {
  const rect = footprint(item);
  const rightGap = room.width - rect.x - rect.width;
  const bottomGap = room.depth - rect.y - rect.depth;
  const wallDistance = Math.min(rect.x, rect.y, rightGap, bottomGap);
  const sideDistance = index % 2 === 0 ? rect.x : rightGap;
  let score = wallDistance * 4 + sideDistance * 0.2;

  if (style === 'daylight') {
    const windows = getOpenings(room).filter((opening) => opening.kind === 'window').map((opening) => openingSegment(room, opening));
    const windowDistance = windows.length ? Math.min(...windows.map((window) => Math.hypot(
      Math.max(window.x - rect.x - rect.width, rect.x - window.x - window.width, 0),
      Math.max(window.y - rect.y - rect.depth, rect.y - window.y - window.depth, 0),
    ))) : wallDistance;
    score += item.kind === 'desk' ? windowDistance * 3 : isBed(item.kind) ? bottomGap : rect.y * 0.2;
  } else if (style === 'open') {
    // Prefer long furniture along the top/bottom walls to keep the middle open.
    score += Math.min(rect.y, bottomGap) * 2;
    if (isBed(item.kind) && !item.rotated) score += 30;
  } else {
    // Separate the bed area at the top from desks toward the bottom.
    score += item.kind === 'desk' ? bottomGap * 2 : rect.y;
  }
  return score;
}

function findPosition(
  item: Furniture,
  room: Room,
  placed: Furniture[],
  style: LayoutStyle,
  index: number,
) {
  let best: Furniture | null = null;
  let bestScore = Infinity;

  for (const rotated of [false, true]) {
    const width = rotated ? item.depth : item.width;
    const depth = rotated ? item.width : item.depth;
    const rectangles = placed.filter((other) => other.kind !== 'rug').map(footprint);
    const xs = axisPositions(room.width - width - WALL_MARGIN,
      rectangles.flatMap((r) => [r.x - width - 10, r.x + r.width + 10]), WALL_MARGIN);
    const ys = axisPositions(room.depth - depth - WALL_MARGIN,
      rectangles.flatMap((r) => [r.y - depth - 10, r.y + r.depth + 10]), WALL_MARGIN);
    for (const x of xs) {
      for (const y of ys) {
        const candidate = { ...item, x, y, rotated };
        if (!canPlace(candidate, room, placed)) continue;
        const score = positionScore(candidate, room, style, index);
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export function generateLayouts(project: Project): LayoutOption[] {
  if (project.furniture.length === 0) return [];
  const styles: { id: LayoutStyle; name: string; description: string }[] = [
    { id: 'balanced', name: 'Balanced room', description: 'Separate sleeping and working areas' },
    { id: 'daylight', name: 'Daylight workspace', description: 'Desks closer to the window' },
    { id: 'open', name: 'Open centre', description: 'Furniture along the walls' },
  ];

  return styles.map((style) => {
    const result = structuredClone(project);
    const placed: Furniture[] = [];
    // Larger pieces go first; the daylight style gives desks first choice.
    const items = [...project.furniture].sort((a, b) => {
      if (a.kind === 'rug' && b.kind !== 'rug') return 1;
      if (b.kind === 'rug' && a.kind !== 'rug') return -1;
      if (style.id === 'daylight') {
        if (a.kind === 'desk' && b.kind !== 'desk') return -1;
        if (b.kind === 'desk' && a.kind !== 'desk') return 1;
      }
      return b.width * b.depth - a.width * a.depth;
    });

    for (const item of items) {
      if (item.kind === 'rug') {
        placed.push(
          clampItem(
            {
              ...item,
              x: (project.room.width - item.width) / 2,
              y: (project.room.depth - item.depth) / 2,
            },
            project.room,
          ),
        );
        continue;
      }
      const index = placed.filter((other) => other.kind === item.kind).length;
      const position = findPosition(item, project.room, placed, style.id, index);
      // Keep items that could not be placed: analysis will clearly flag their conflicts.
      placed.push(position ?? { ...item });
    }

    result.furniture = project.furniture.map((item) =>
      placed.find((other) => other.id === item.id)!,
    );
    return { ...style, project: result, issueCount: analyze(result).issues.length };
  });
}
