import type { Furniture, Rotation } from './model.ts';

export const rotations: Rotation[] = [0, 90, 180, 270];
type Orientation = { rotated?: boolean; rotation?: Rotation };
export const rotationOf = (item: Orientation): Rotation => item.rotation ?? (item.rotated ? 90 : 0);
export const isSideways = (item: Orientation) => rotationOf(item) % 180 === 90;
export const orientation = (rotation: Rotation) => ({ rotation, rotated: rotation % 180 === 90 });
export const turnFurniture = (item: Furniture): Furniture => ({
  ...item, ...orientation(((rotationOf(item) + 90) % 360) as Rotation),
});

// Map a point in the original drawing to its rotated, top-left anchored footprint.
export function furniturePoint(item: Furniture, x: number, y: number, z = 0): number[] {
  switch (rotationOf(item)) {
    case 90: return [item.x + item.depth - y, item.y + x, z];
    case 180: return [item.x + item.width - x, item.y + item.depth - y, z];
    case 270: return [item.x + y, item.y + item.width - x, z];
    default: return [item.x + x, item.y + y, z];
  }
}

export function furnitureTransform(item: Furniture): string | undefined {
  switch (rotationOf(item)) {
    case 90: return `translate(${item.depth} 0) rotate(90)`;
    case 180: return `translate(${item.width} ${item.depth}) rotate(180)`;
    case 270: return `translate(0 ${item.width}) rotate(270)`;
    default: return undefined;
  }
}
