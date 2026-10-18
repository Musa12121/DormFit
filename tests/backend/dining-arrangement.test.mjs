import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../src/domain/model.ts';
import { createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { diningChairGroups, diningSeatingPenalty } from '../../src/domain/dining.ts';
import { orientation } from '../../src/domain/rotation.ts';
import { footprint } from '../../src/domain/geometry.ts';
import { furnitureGap, TV_DINING_CLEARANCE } from '../../src/domain/spacing.ts';
import { functionalPlacementAllowed, facesTable } from '../../src/domain/usability.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { isProject } from '../../src/domain/storage.ts';
import { fourSeatDiningAllowed } from '../../src/domain/usability.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({ id, kind, name: id, x, y, width, depth, owner: 'shared', ...orientation(rotation) });
const room = { width: 700, depth: 700, door: 85, window: 155, openings: [] };
for (const rotation of [0, 90, 180, 270]) test(`four chairs prefer the four long-side place settings at ${rotation} degrees`, () => {
  const table = item('table', 'dining-table', 250, 250, 140, 80, rotation);
  const chairs = Array.from({ length: 4 }, (_, i) => item(`chair-${i}`, 'chair', 0, 0, 45, 45));
  const group = diningChairGroups(table, chairs)[0];
  assert.equal(group.length, 4); assert.equal(diningSeatingPenalty(table, group), 0);
  assert.ok(group.every(chair => facesTable(chair, table)));
  const directions = [...new Set(group.map(chair => chair.rotation))];
  assert.equal(directions.length, 2);
  assert.ok(directions.every(direction => group.filter(chair => chair.rotation === direction).length === 2));
  const top = footprint(table), alongX = top.width >= top.depth;
  const tableCentre = alongX ? top.x + top.width / 2 : top.y + top.depth / 2;
  for (const direction of directions) {
    const centres = group.filter(chair => chair.rotation === direction).map(chair => {
      const seat = footprint(chair);
      return alongX ? seat.x + seat.width / 2 : seat.y + seat.depth / 2;
    }).sort((a, b) => a - b);
    assert.equal((centres[0] + centres[1]) / 2, tableCentre, 'Centre each pair of chairs along its table side');
    const length = alongX ? top.width : top.depth;
    assert.ok(Math.abs(centres[0] - (tableCentre - length / 4)) <= 5
      && Math.abs(centres[1] - (tableCentre + length / 4)) <= 5, 'Align chairs with the four plate positions');
  }
  assert.deepEqual(analyze({ room, furniture: [table, ...group] }).issues, []);
});

for (const kind of ['tv-stand', 'television']) test(`${kind} keeps dining chairs and tables beyond the general 30 cm gap`, () => {
  const tv = item('tv', kind, 660, 250, 140, kind === 'television' ? 5 : 40, 90);
  // Use the actual right-wall footprint for each TV type.
  tv.x = room.width - tv.depth;
  for (const otherKind of ['chair', 'dining-table']) {
    const dining = item('dining', otherKind, tv.x - 80 - 30, 280, 80, 45);
    assert.equal(functionalPlacementAllowed(dining, room, [tv]), false);
    assert.equal(functionalPlacementAllowed(tv, room, [dining]), false);
    const source = { version: 1, name: 'Dining space', room, furniture: [tv, dining] };
    const plan = { positions: source.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
      explanation: 'A room.', requirements: [], tips: [], unmetRequests: [] };
    assert.equal(checkAiPlan(plan, source, '').ok, false);
    const clear = { ...dining, x: tv.x - 80 - TV_DINING_CLEARANCE };
    assert.equal(functionalPlacementAllowed(clear, room, [tv]), true);
    assert.equal(functionalPlacementAllowed(tv, room, [clear]), true);
  }
});

test('the reported four-chair room offers a complete long-side dining set separated from the TV', () => {
  const counts = { sofa: 2, chair: 4, rug: 1, 'dining-table': 1, 'tv-stand': 1 };
  const source = createProject({ width: 400, depth: 500, door: 85, window: 155, openings: [
    { id: 'opening-door', kind: 'door', wall: 'right', offset: 50, width: 85 },
    { id: 'opening-window-left', kind: 'window', wall: 'left', offset: 70, width: 200 },
    { id: 'opening-window-bottom', kind: 'window', wall: 'bottom', offset: 150, width: 170 },
  ] }, catalog.filter(piece => counts[piece.kind]).map(piece => ({ ...piece, count: counts[piece.kind] })));
  assert.equal(isProject(source), true);
  const options = generateLayouts(source);
  const complete = options.filter(option => option.project.furniture.filter(piece => piece.kind === 'chair').length === 4);
  assert.ok(complete.length > 0, 'Move the dining group to keep all four chairs');
  assert.ok(complete.some(option => diningSeatingPenalty(option.project.furniture.find(piece => piece.kind === 'dining-table'),
    option.project.furniture.filter(piece => piece.kind === 'chair')) === 0), 'Try two chairs per long side before table heads');
  for (const option of options) {
    assert.deepEqual(analyze(option.project).issues, []);
    const tv = option.project.furniture.find(piece => piece.kind === 'tv-stand');
    const chairs = option.project.furniture.filter(piece => piece.kind === 'chair');
    const table = option.project.furniture.find(piece => piece.kind === 'dining-table');
    assert.equal(chairs.length, 4, 'Do not replace a four-seat set with an omitted-chair workaround');
    assert.equal(fourSeatDiningAllowed(table, chairs), true, 'Every offered option must be two plus two');
    for (const piece of option.project.furniture.filter(piece => ['dining-table', 'chair'].includes(piece.kind))) {
      assert.ok(furnitureGap(tv, piece) >= TV_DINING_CLEARANCE - .001);
    }
  }
});

test('AI head seats fail validation and the endpoint repairs the four-chair set to two plus two', async () => {
  const table = item('table', 'dining-table', 250, 250, 140, 80);
  const chairs = [item('c1', 'chair', 267.5, 190, 45, 45), item('c2', 'chair', 405, 267.5, 45, 45, 90),
    item('c3', 'chair', 267.5, 345, 45, 45, 180), item('c4', 'chair', 190, 267.5, 45, 45, 270)];
  const source = { version: 1, name: 'Four diners', room, furniture: [table, ...chairs] };
  const plan = { positions: source.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
    explanation: 'Dining room.', requirements: [], tips: [], unmetRequests: [] };
  assert.equal(checkAiPlan(plan, source, '').ok, false);
  const omitted = { ...plan, positions: plan.positions.filter(position => position.id !== 'c4'), omittedChairIds: ['c4'] };
  assert.equal(checkAiPlan(omitted, source, '').ok, false, 'Omitting a chair cannot bypass the four-seat requirement');
  let calls = 0;
  const response = await getLayoutAdvice({ project: source, prompt: '' }, { model: 'fake-model', apiKey: 'fake-key' }, async () => {
    calls++; return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(plan) }] } }] });
  });
  assert.equal(calls, 1);
  const checked = checkAiPlan(response, source, '');
  assert.equal(checked.ok, true);
  const placed = checked.layout.project.furniture;
  assert.equal(placed.filter(piece => piece.kind === 'chair').length, 4);
  assert.equal(fourSeatDiningAllowed(placed.find(piece => piece.kind === 'dining-table'), placed.filter(piece => piece.kind === 'chair')), true);
});
