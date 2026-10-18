import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/domain/planner.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { footprint } from '../../src/domain/geometry.ts';
import { orientation } from '../../src/domain/rotation.ts';
import { functionalPlacementAllowed, operatingZone, SOFA_LEGROOM } from '../../src/domain/usability.ts';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({ id, name: id, kind, x, y, width, depth, owner: 'shared', ...orientation(rotation) });
const room = { width: 700, depth: 700, door: 85, window: 155, openings: [] };
const project = furniture => ({ version: 1, name: 'Corner seating', room, furniture });
const plan = source => ({ positions: source.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
  explanation: 'Corner seating.', tips: [], requirements: [], unmetRequests: [] });
const turn = furniture => furniture.map(piece => {
  const rect = footprint(piece);
  return { ...piece, x: room.width - rect.y - rect.depth, y: rect.x, ...orientation((piece.rotation + 90) % 360) };
});

for (let turns = 0; turns < 4; turns++) test(`corner sofas reserve end-seat legroom at ${turns * 90} degrees`, () => {
  // Their footprints have a 30 cm gap, but the left sofa blocks the end
  // seat's legs on the upper sofa. Move it down to the 60 cm boundary.
  let blocked = [item('upper', 'sofa', 100, 100, 200, 90), item('left', 'sofa', 100, 220, 200, 90, 270)];
  let clear = [blocked[0], { ...blocked[1], y: 250 }];
  for (let step = 0; step < turns; step++) { blocked = turn(blocked); clear = turn(clear); }
  assert.ok(analyze(project(blocked)).issues.some(issue => issue.type === 'operation' && /legroom/.test(issue.text)));
  assert.equal(checkAiPlan(plan(project(blocked)), project(blocked), '').ok, false);
  assert.equal(functionalPlacementAllowed(blocked[0], room, [blocked[1]]), false);
  assert.equal(functionalPlacementAllowed(blocked[1], room, [blocked[0]]), false);
  assert.deepEqual(analyze(project(clear)).issues, []);
});

test('legroom permits rugs but rejects solid furniture and walls', () => {
  const sofa = item('sofa', 'sofa', 100, 100, 200, 90);
  assert.deepEqual(operatingZone(sofa), { x: 100, y: 190, width: 200, depth: SOFA_LEGROOM });
  assert.deepEqual(analyze(project([sofa, item('rug', 'rug', 100, 200, 200, 150)])).issues, []);
  for (const kind of ['chair', 'coffee-table', 'armchair']) {
    assert.equal(functionalPlacementAllowed(sofa, room, [item('blocker', kind, 150, 230, 45, 45)]), false);
  }
  assert.equal(functionalPlacementAllowed({ ...sofa, y: 600 }, room, []), false);
});

test('AI repair separates corner sofas without dropping either sofa', () => {
  const source = project([item('upper', 'sofa', 100, 100, 200, 90), item('left', 'sofa', 100, 220, 200, 90, 270)]);
  const repaired = repairAiPlan(plan(source), source, '');
  assert.ok(repaired);
  const checked = checkAiPlan(repaired, source, '');
  assert.equal(checked.ok, true);
  assert.equal(checked.layout.project.furniture.length, 2);
  assert.deepEqual(analyze(checked.layout.project).issues, []);
});
