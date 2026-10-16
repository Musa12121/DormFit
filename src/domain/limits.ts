// A practical safety limit keeps drawing and layout searches predictable.
export const MIN_ROOM_CM = 200;
export const MAX_ROOM_CM = 10_000;
export const MAX_ROOM_METRES = MAX_ROOM_CM / 100;
