import { catalog, isBed, retiredCatalog, supportedFurniture } from './model.ts';
import type { Furniture, FurnitureKind, Project, Room } from './model.ts';

export const MAX_FURNITURE = 30;
export const MAX_PER_KIND = 10;

export interface FurnitureRequest {
  kind: FurnitureKind;
  count: number;
  width: number;
  depth: number;
  wallMounted?: boolean;
}

export function emptyProject(): Project {
  return {
    version: 1,
    name: 'My room',
    room: { width: 420, depth: 360, door: 85, window: 155 },
    furniture: [],
  };
}

// Read quantities from the actual furniture list, so saved and edited plans stay in sync.
export function getFurnitureRequests(project: Project): FurnitureRequest[] {
  const available = [...catalog, ...retiredCatalog.filter(entry => project.furniture.some(item => item.kind === entry.kind))];
  return available.map((entry) => {
    const matching = project.furniture.filter((item) => item.kind === entry.kind);
    return {
      kind: entry.kind,
      count: matching.length,
      width: matching[0]?.width ?? entry.width,
      depth: matching[0]?.depth ?? entry.depth,
      ...(entry.kind === 'television' ? { wallMounted: true } : {}),
    };
  });
}

export function createProject(room: Room, requests: FurnitureRequest[]): Project {
  const total = requests.reduce((sum, request) => sum + request.count, 0);
  if (total < 1 || total > MAX_FURNITURE) {
    throw new Error(`1–${MAX_FURNITURE} furniture items.`);
  }

  const furniture: Furniture[] = [];
  for (const request of requests) {
    const entry = supportedFurniture.find((item) => item.kind === request.kind);
    if (
      !entry ||
      !Number.isInteger(request.count) ||
      request.count < 0 ||
      request.count > MAX_PER_KIND
      || (request.wallMounted !== undefined && (request.kind !== 'television' || typeof request.wallMounted !== 'boolean'))
    ) {
      throw new Error('Invalid furniture quantity.');
    }
    if (request.count === 0) continue;
    if (
      !Number.isFinite(request.width) ||
      !Number.isFinite(request.depth) ||
      request.width < 20 ||
      request.width > 400 ||
      request.depth < 20 ||
      request.depth > 400
    ) {
      throw new Error('Furniture dimensions must be between 20 and 400 cm.');
    }
    for (let index = 0; index < request.count; index++) {
      furniture.push({
        id: `${request.kind}-${index + 1}`,
        kind: request.kind,
        name: `${request.kind === 'bed' ? 'Bed' : entry.name} ${index + 1}`,
        width: request.width,
        depth: request.depth,
        x: 10,
        y: 10,
        rotated: false,
        ...(request.kind === 'television' ? { wallMounted: true } : {}),
        owner: isBed(request.kind) ? 'a' : request.kind === 'desk' ? 'b' : 'shared',
      });
    }
  }
  return { version: 1, name: 'My room', room: { ...room }, furniture };
}
