import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { blocksTv, canWatchTv } from '../../src/domain/usability.ts';
import { entranceZones, furnitureEntranceZones } from '../../src/domain/openings.ts';
import { footprint, overlaps } from '../../src/domain/geometry.ts';
import { wallTvPositions } from '../../src/domain/mounting.ts';
import { orientation, rotations } from '../../src/domain/rotation.ts';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({
  id, kind, name: id, x, y, width, depth, owner: 'shared', ...orientation(rotation),
});
const source = furniture => ({ ...emptyProject(),
  room: { width: 1000, depth: 1000, door: 85, window: 155, openings: [] }, furniture });
const plan = project => ({ positions: project.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
  requirements: [], unmetRequests: [], explanation: 'A proposed room arrangement.', tips: [] });

for (const rotation of rotations) test(`a TV must face the viewer beyond the bed foot at ${rotation} degrees`, () => {
  const bed = item('bed', 'bed', 200, 200, 100, 200, rotation);
  const television = item('tv', 'television', 0, 0, 100, 25);
  const room = source([bed, television]);
  const candidates = wallTvPositions(television, room.room, [bed]);
  assert.ok(candidates.length);
  assert.ok(candidates.every(tv => canWatchTv(bed, tv, [bed, tv])));
  assert.ok(candidates.every(tv => tv.rotation === (rotation + 180) % 360));
  const abovePillow = wallTvPositions(television, room.room).find(tv => tv.rotation === rotation);
  assert.equal(canWatchTv(bed, abovePillow), false);
  const bad = { ...room, furniture: [bed, abovePillow] };
  assert.ok(analyze(bad).issues.some(issue => issue.type === 'view'));
  assert.equal(checkAiPlan(plan(bad), bad).ok, false);
});

test('viewing rejects excessive side angles and blockers beyond the old 150 cm TV zone', () => {
  const bed = item('bed', 'bed', 200, 200, 100, 200, 270);
  const tv = item('tv', 'television', 975, 200, 100, 25, 90);
  assert.equal(canWatchTv(bed, tv), true);
  assert.equal(canWatchTv(bed, { ...tv, y: 850 }), false);
  for (const kind of ['wardrobe', 'desk']) {
    const blocker = item('blocker', kind, 500, 230, 80, 55);
    assert.equal(blocksTv(tv, blocker), false, 'This blocker is outside the old screen-front rectangle');
    assert.equal(canWatchTv(bed, tv, [bed, tv, blocker]), false);
    assert.equal(canWatchTv(bed, tv, [bed, tv, { ...blocker, y: 600 }]), true);
  }
});

for (const wall of ['top', 'right', 'bottom', 'left']) test(`floor lamps keep a buffer beside the ${wall} door`, () => {
  const room = { width: 500, depth: 500, door: 85, window: 155,
    openings: [{ id: 'opening-entry', kind: 'door', wall, width: 85, offset: 150 }] };
  const raw = entranceZones(room)[0];
  const horizontal = wall === 'top' || wall === 'bottom';
  const lamp = item('lamp', 'floor-lamp', horizontal ? raw.x + raw.width + 5 : raw.x + 20,
    horizontal ? raw.y + 20 : raw.y + raw.depth + 5, 40, 40);
  assert.equal(overlaps(footprint(lamp), raw), false, 'A clear base alone previously passed');
  assert.equal(furnitureEntranceZones(room, lamp).some(zone => overlaps(footprint(lamp), zone)), true);
  const project = { ...emptyProject(), room, furniture: [lamp] };
  assert.ok(analyze(project).issues.some(issue => issue.type === 'door'));
  assert.equal(checkAiPlan(plan(project), project).ok, false);
  if (horizontal) lamp.x += 15; else lamp.y += 15;
  assert.deepEqual(analyze(project).issues, []);
});

test('AI repair moves a TV away from the headboard to the bed viewing direction', () => {
  const bed = item('bed', 'bed', 200, 200, 100, 200);
  const tv = item('tv', 'television', 200, 0, 100, 25);
  const project = source([bed, tv]);
  const repaired = repairAiPlan(plan(project), project);
  assert.ok(repaired?.adjusted);
  const checked = checkAiPlan(repaired, project);
  assert.equal(checked.ok, true);
  const resultBed = checked.layout.project.furniture.find(item => item.kind === 'bed');
  const resultTv = checked.layout.project.furniture.find(item => item.kind === 'television');
  assert.equal(canWatchTv(resultBed, resultTv, checked.layout.project.furniture), true);
});

test('every algorithm style fixes the reported bed, TV and lamp combination without dropping pieces', () => {
  const requests = [['bed', 100, 200], ['desk', 120, 65], ['office-chair', 65, 65], ['wardrobe', 80, 55],
    ['nightstand', 45, 40], ['television', 100, 25], ['floor-lamp', 40, 40], ['rug', 150, 120]]
    .map(([kind, width, depth]) => ({ kind, width, depth, count: 1 }));
  for (const [width, depth] of [[300, 500], [420, 360]]) {
    const project = createProject({ width, depth, door: 85, window: 155 }, requests);
    for (const layout of generateLayouts(project)) {
      assert.equal(layout.issueCount, 0, `${width} × ${depth}: ${layout.name}`);
      const furniture = layout.project.furniture;
      assert.equal(furniture.length, project.furniture.length);
      assert.equal(canWatchTv(furniture.find(item => item.kind === 'bed'), furniture.find(item => item.kind === 'television'), furniture), true);
      const lamp = furniture.find(item => item.kind === 'floor-lamp');
      assert.equal(furnitureEntranceZones(project.room, lamp).some(zone => overlaps(zone, footprint(lamp))), false);
    }
  }
});
