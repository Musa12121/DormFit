export type FurnitureKind = 'bed' | 'desk' | 'wardrobe' | 'shelf' | 'plant' | 'rug'
  | 'double-bed' | 'bunk-bed' | 'sofa' | 'armchair' | 'chair' | 'stool' | 'bench'
  | 'nightstand' | 'dresser' | 'cabinet' | 'shoe-rack' | 'coffee-table' | 'dining-table'
  | 'side-table' | 'tv-stand' | 'vanity' | 'ottoman' | 'clothes-rack'
  | 'office-chair' | 'television' | 'fridge' | 'washing-machine' | 'storage-box' | 'floor-lamp';
export type Owner = 'a' | 'b' | 'shared';
export type Rotation = 0 | 90 | 180 | 270;
// All stored measurements are centimetres. Forms convert metres at the boundary.
export type Wall = 'top' | 'right' | 'bottom' | 'left';
export interface RoomOpening {
  id: string;
  kind: 'door' | 'window';
  wall: Wall;
  offset: number;
  width: number;
}
export interface Room {
  width: number;
  depth: number;
  height?: number;
  door: number;
  window: number;
  // Absent in older saved files: use their centred door and window.
  openings?: RoomOpening[];
}
export interface Furniture {
  id: string;
  kind: FurnitureKind;
  name: string;
  width: number;
  depth: number;
  x: number;
  y: number;
  rotated: boolean;
  // Older files have only rotated. New edits also store the full direction.
  rotation?: Rotation;
  wallMounted?: boolean;
  owner: Owner;
}

// The standalone television catalog entry is always wall-mounted. The optional
// saved flag remains readable for older files; the TV stand is a separate item.
export const isWallMounted = (item: Furniture) => item.kind === 'television';
export const occupiesFloor = (item: Furniture) => item.kind !== 'rug' && !isWallMounted(item);
export interface Roommate {
  name: string;
  daylight: boolean;
  privacy: boolean;
}
export interface Project {
  version: 1;
  name: string;
  room: Room;
  furniture: Furniture[];
  omittedChairs?: Furniture[];
  // Optional so previously saved roommate plans can still be opened.
  roommates?: [Roommate, Roommate];
}
export interface SavedProject {
  id: string;
  updatedAt: string;
  project: Project;
}
export interface CatalogItem {
  kind: FurnitureKind;
  name: string;
  width: number;
  depth: number;
  description: string;
  hint?: string;
}

export const catalog: CatalogItem[] = [
  { kind: 'bed', name: 'Single bed', width: 100, depth: 200, description: '100 × 200 cm' },
  { kind: 'desk', name: 'Desk', width: 120, depth: 65, description: '120 × 65 cm' },
  { kind: 'wardrobe', name: 'Wardrobe', width: 80, depth: 55, description: '80 × 55 cm' },
  { kind: 'shelf', name: 'Bookshelf', width: 75, depth: 30, description: '75 × 30 cm' },
  { kind: 'plant', name: 'Plant', width: 35, depth: 35, description: '35 × 35 cm' },
  { kind: 'rug', name: 'Carpet', width: 150, depth: 120, description: '150 × 120 cm · underlay' },
  { kind: 'double-bed', name: 'Double bed', width: 160, depth: 200, description: '160 × 200 cm' },
  { kind: 'bunk-bed', name: 'Bunk bed', width: 100, depth: 210, description: '100 × 210 cm', hint: 'Two beds, one above the other, with a ladder.' },
  { kind: 'sofa', name: 'Sofa', width: 200, depth: 90, description: '200 × 90 cm' },
  { kind: 'armchair', name: 'Sofa chair', width: 85, depth: 85, description: '85 × 85 cm', hint: 'A soft sofa seat for one person.' },
  { kind: 'chair', name: 'Chair', width: 45, depth: 45, description: '45 × 45 cm' },
  { kind: 'office-chair', name: 'Office chair', width: 65, depth: 65, description: '65 × 65 cm', hint: 'A desk chair with a backrest and wheels.' },
  { kind: 'television', name: 'Wall-mounted TV', width: 100, depth: 25, description: '100 × 25 cm', hint: 'A television fixed to the wall. No floor stand.' },
  { kind: 'nightstand', name: 'Bedside table', width: 45, depth: 40, description: '45 × 40 cm', hint: 'A small table next to your bed.' },
  { kind: 'dresser', name: 'Drawers', width: 100, depth: 50, description: '100 × 50 cm', hint: 'A low chest of drawers for clothes.' },
  { kind: 'cabinet', name: 'Storage cabinet', width: 80, depth: 45, description: '80 × 45 cm', hint: 'A cupboard with doors for storing things.' },
  { kind: 'shoe-rack', name: 'Shoe rack', width: 75, depth: 35, description: '75 × 35 cm' },
  { kind: 'coffee-table', name: 'Small table', width: 100, depth: 55, description: '100 × 55 cm', hint: 'A low table in front of a sofa.' },
  { kind: 'dining-table', name: 'Dining table', width: 140, depth: 80, description: '140 × 80 cm' },
  { kind: 'fridge', name: 'Fridge', width: 60, depth: 65, description: '60 × 65 cm', hint: 'A refrigerator with a freezer compartment.' },
  { kind: 'tv-stand', name: 'TV stand', width: 140, depth: 40, description: '140 × 40 cm', hint: 'A low cabinet with a television on top.' },
  { kind: 'washing-machine', name: 'Washing machine', width: 60, depth: 60, description: '60 × 60 cm', hint: 'A front-loading machine for washing clothes.' },
  { kind: 'storage-box', name: 'Storage box', width: 60, depth: 40, description: '60 × 40 cm', hint: 'A box with a lid for storing things.' },
  { kind: 'floor-lamp', name: 'Floor lamp', width: 35, depth: 35, description: '35 × 35 cm', hint: 'A tall lamp that stands on the floor.' },
];

// Keep older saved rooms readable, without offering these types in the new catalog.
export const retiredCatalog: CatalogItem[] = [
  { kind: 'stool', name: 'Stool', width: 40, depth: 40, description: '40 × 40 cm' },
  { kind: 'bench', name: 'Bench', width: 120, depth: 45, description: '120 × 45 cm' },
  { kind: 'side-table', name: 'Side table', width: 45, depth: 45, description: '45 × 45 cm' },
  { kind: 'vanity', name: 'Vanity', width: 100, depth: 45, description: '100 × 45 cm' },
  { kind: 'ottoman', name: 'Ottoman', width: 60, depth: 60, description: '60 × 60 cm' },
  { kind: 'clothes-rack', name: 'Clothes rack', width: 100, depth: 45, description: '100 × 45 cm' },
];
export const supportedFurniture = [...catalog, ...retiredCatalog];
export const furnitureLabels = Object.fromEntries(supportedFurniture.map(entry => [entry.kind,
  entry.kind === 'bed' ? 'Bed' : entry.name])) as Record<FurnitureKind, string>;

export function isBed(kind: FurnitureKind) {
  return kind === 'bed' || kind === 'double-bed' || kind === 'bunk-bed';
}

export function defaultProject(): Project {
  return {
    version: 1,
    name: 'Example room',
    room: { width: 420, depth: 360, door: 85, window: 155 },
    furniture: [
      {
        id: 'bed-a',
        kind: 'bed',
        name: 'Bed 1',
        width: 100,
        depth: 200,
        x: 16,
        y: 16,
        rotated: false,
        owner: 'a',
      },
      {
        id: 'bed-b',
        kind: 'bed',
        name: 'Bed 2',
        width: 100,
        depth: 200,
        x: 304,
        y: 16,
        rotated: false,
        owner: 'b',
      },
      {
        id: 'desk-a',
        kind: 'desk',
        name: 'Desk 1',
        width: 120,
        depth: 65,
        x: 16,
        y: 279,
        rotated: false,
        owner: 'a',
      },
      {
        id: 'desk-b',
        kind: 'desk',
        name: 'Desk 2',
        width: 120,
        depth: 65,
        x: 284,
        y: 279,
        rotated: false,
        owner: 'b',
      },
      {
        id: 'wardrobe-1',
        kind: 'wardrobe',
        name: 'Shared wardrobe',
        width: 80,
        depth: 55,
        x: 170,
        y: 16,
        rotated: false,
        owner: 'shared',
      },
      {
        id: 'rug-1',
        kind: 'rug',
        name: 'Shared rug',
        width: 150,
        depth: 120,
        x: 135,
        y: 128,
        rotated: false,
        owner: 'shared',
      },
    ],
  };
}

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}
