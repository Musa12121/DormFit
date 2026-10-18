import type { Project } from './model.ts';
import { occupiesFloor } from './model.ts';
import { footprint } from './geometry.ts';
import { getOpenings } from './openings.ts';
import { rotationOf } from './rotation.ts';
import { facesTable, isChair } from './usability.ts';

export const WALKWAY_WIDTH = 60;

// Trace the centre of a 60 cm square through free floor space. Coordinates come
// from obstacle edges, so large rooms need no huge grid or arbitrary metre cap.
export function inaccessibleFurniture(project: Pick<Project, 'room' | 'furniture'>): string[] {
  const doors = getOpenings(project.room).filter(opening => opening.kind === 'door');
  const solid = project.furniture.filter(occupiesFloor);
  if (!doors.length || !solid.length) return [];
  const radius = WALKWAY_WIDTH / 2;
  const { width, depth } = project.room;
  const rectangles = solid.map(footprint);
  const obstacles = rectangles.map(rect => ({
    left: rect.x - radius, right: rect.x + rect.width + radius,
    top: rect.y - radius, bottom: rect.y + rect.depth + radius,
  }));
  const starts = doors.map(door => {
    const centre = door.offset + door.width / 2;
    switch (door.wall) {
      case 'top': return { x: centre, y: radius };
      case 'bottom': return { x: centre, y: depth - radius };
      case 'left': return { x: radius, y: centre };
      case 'right': return { x: width - radius, y: centre };
    }
  });
  const axis = (values: number[], end: number) => [...new Set([radius, end - radius,
    ...values.filter(value => value >= radius && value <= end - radius)])].sort((a, b) => a - b);
  const xs = axis([...obstacles.flatMap(rect => [rect.left, rect.right]),
    ...rectangles.map(rect => rect.x + rect.width / 2), ...starts.map(point => point.x)], width);
  const ys = axis([...obstacles.flatMap(rect => [rect.top, rect.bottom]),
    ...rectangles.map(rect => rect.y + rect.depth / 2), ...starts.map(point => point.y)], depth);
  const clear = (x: number, y: number) => x >= radius && x <= width - radius && y >= radius && y <= depth - radius
    && !obstacles.some(rect => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom);
  const columns = xs.length;
  const free = new Uint8Array(columns * ys.length);
  for (let y = 0; y < ys.length; y++) for (let x = 0; x < columns; x++) {
    free[y * columns + x] = Number(clear(xs[x], ys[y]));
  }
  const indexOf = (point: { x: number; y: number }) => ys.indexOf(point.y) * columns + xs.indexOf(point.x);
  const first = indexOf(starts[0]);
  if (!free[first]) return solid.map(item => item.id);
  const reached = new Uint8Array(free.length);
  const queue = [first]; reached[first] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % columns, y = Math.floor(index / columns);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || nx >= columns || ny < 0 || ny >= ys.length) continue;
      const next = ny * columns + nx;
      // Checking the connecting segment prevents jumping through an obstacle
      // whose two boundary points are both free.
      if (reached[next] || !free[next] || !clear((xs[x] + xs[nx]) / 2, (ys[y] + ys[ny]) / 2)) continue;
      reached[next] = 1; queue.push(next);
    }
  }
  const frontAccess = new Set(['wardrobe', 'dresser', 'cabinet', 'fridge', 'washing-machine']);
  const blocked = solid.filter((item, i) => !queue.some(index => {
    const rect = rectangles[i];
    const x = xs[index % columns], y = ys[Math.floor(index / columns)];
    const nearby = Math.hypot(Math.max(rect.x - x, x - rect.x - rect.width, 0),
      Math.max(rect.y - y, y - rect.y - rect.depth, 0)) <= radius + 0.001;
    if (!nearby || !frontAccess.has(item.kind)) return nearby;
    switch (rotationOf(item)) {
      case 90: return x <= rect.x - radius + 0.001 && y >= rect.y && y <= rect.y + rect.depth;
      case 180: return y <= rect.y - radius + 0.001 && x >= rect.x && x <= rect.x + rect.width;
      case 270: return x >= rect.x + rect.width + radius - 0.001 && y >= rect.y && y <= rect.y + rect.depth;
      default: return y >= rect.y + rect.depth + radius - 0.001 && x >= rect.x && x <= rect.x + rect.width;
    }
  })).map(item => item.id);
  // A seated user reaches the table through its chair. Requiring a separate
  // 60 cm route to the tabletop rejects a properly occupied dining table.
  const unreachable = blocked.filter(id => {
    const table = solid.find(item => item.id === id)!;
    if (!['dining-table', 'desk', 'vanity'].includes(table.kind)) return true;
    return !solid.some(chair => isChair(chair) && !blocked.includes(chair.id) && facesTable(chair, table));
  });
  // A disconnected second doorway is also a blocked entrance.
  return starts.some(start => !reached[indexOf(start)]) ? solid.map(item => item.id) : unreachable;
}
