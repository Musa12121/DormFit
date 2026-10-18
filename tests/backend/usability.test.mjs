import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { orientation, rotations } from '../../src/domain/rotation.ts';
import { inaccessibleFurniture } from '../../src/domain/access.ts';
import { bedsidePositions, besideBed, blocksTv, chairPositions, chairTarget, facesTable, frontZone, usabilityIssues } from '../../src/domain/usability.ts';
import { furnitureGap } from '../../src/domain/spacing.ts';
import { planValidationError } from '../../server/geminiErrors.mjs';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({
  id, kind, name: id, x, y, width, depth, owner: 'shared', ...orientation(rotation),
});
const source = furniture => ({ ...emptyProject(), room: { width: 500, depth: 450, door: 85, window: 155, openings: [] }, furniture });
const plan = project => ({ positions: project.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
  requirements: [], unmetRequests: [], explanation: 'Proposed furniture placement.', tips: [] });

test('a reachable wardrobe is still rejected when a bedside table blocks part of its door clearance', () => {
  const project = source([item('wardrobe', 'wardrobe', 100, 100, 80, 55), item('bedside', 'nightstand', 150, 190, 45, 40)]);
  assert.deepEqual(inaccessibleFurniture(project), []);
  const issue = analyze(project).issues.find(issue => issue.type === 'operation');
  assert.deepEqual(issue.ids, ['wardrobe', 'bedside']);
  assert.equal(checkAiPlan(plan(project), project).ok, false);
  project.furniture[1].y = 215; // Exactly 60 cm in front of the wardrobe.
  assert.deepEqual(analyze(project).issues, []);
});

for (const rotation of rotations) {
  test(`storage opening clearance follows the full front at ${rotation} degrees`, () => {
    const wardrobe = item('wardrobe', 'wardrobe', 150, 150, 80, 55, rotation);
    const zone = frontZone(wardrobe, 60);
    const blocker = item('lamp', 'floor-lamp', zone.x + zone.width / 2 - 10, zone.y + zone.depth / 2 - 10, 20, 20);
    assert.ok(usabilityIssues(source([wardrobe, blocker])).some(issue => issue.type === 'operation'));
    const desk = item('desk', 'desk', 180, 180, 120, 65, rotation);
    const chair = chairPositions(item('chair', 'office-chair', 0, 0, 65, 65), [desk])[0];
    assert.equal(facesTable(chair, desk), true);
    const wrong = { ...chair, ...orientation(rotation) };
    assert.equal(facesTable(wrong, desk), false);
    assert.ok(analyze(source([desk, wrong])).issues.some(issue => issue.type === 'facing'));
    assert.equal(checkAiPlan(plan(source([desk, wrong])), source([desk, wrong])).ok, false);
  });
}

test('storage cannot open into a wall even in a room without a door', () => {
  const project = source([item('wardrobe', 'wardrobe', 100, 0, 80, 55, 180)]);
  assert.ok(analyze(project).issues.some(issue => issue.type === 'operation'));
});

test('standalone chairs remain independent and dining chairs may face any table edge', () => {
  assert.deepEqual(analyze(source([item('chair', 'chair', 100, 100, 45, 45)])).issues, []);
  const table = item('table', 'dining-table', 180, 180, 120, 80);
  const positions = chairPositions(item('chair', 'chair', 0, 0, 45, 45), [table]);
  assert.equal(new Set(positions.map(chair => chair.rotation)).size, 4);
  assert.ok(positions.every(chair => facesTable(chair, table)));
});

test('a chair between workstations belongs to the desk it actually faces', () => {
  const behind = item('behind', 'desk', 150, 10, 120, 65);
  const ahead = item('ahead', 'desk', 150, 220, 120, 65, 180);
  const chair = item('chair', 'office-chair', 175, 110, 65, 65);
  assert.equal(chairTarget(chair, [behind, ahead]).id, 'ahead');
  assert.equal(facesTable(chair, ahead), true);
});

test('the reported small-room furniture set has facing chairs and opening space in every local layout', () => {
  const requests = [['double-bed', 160, 200], ['desk', 120, 65], ['office-chair', 65, 65],
    ['wardrobe', 80, 55], ['nightstand', 45, 40], ['television', 100, 25], ['floor-lamp', 40, 40]]
    .map(([kind, width, depth]) => ({ kind, width, depth, count: 1, ...(kind === 'television' ? { wallMounted: true } : {}) }));
  const project = createProject({ width: 300, depth: 500, door: 85, window: 155 }, requests);
  const original = structuredClone(project);
  for (const layout of generateLayouts(project)) {
    assert.equal(layout.issueCount, 0, layout.name);
    assert.deepEqual(usabilityIssues(layout.project), []);
    const desk = layout.project.furniture.find(item => item.kind === 'desk');
    const chair = layout.project.furniture.find(item => item.kind === 'office-chair');
    assert.equal(facesTable(chair, desk), true);
    assert.equal(layout.project.furniture.length, project.furniture.length);
  }
  assert.deepEqual(project, original);
});

test('AI repair corrects a backward chair and blocked wardrobe without dropping a near condition', () => {
  const project = source([item('desk', 'desk', 10, 10, 120, 65), item('chair', 'office-chair', 35, 110, 65, 65),
    item('wardrobe', 'wardrobe', 300, 10, 80, 55), item('bedside', 'nightstand', 340, 100, 45, 40)]);
  const proposal = plan(project);
  proposal.requirements = [{ itemId: 'chair', targetId: 'desk', relation: 'near' }];
  const review = { requirements: proposal.requirements, unmetRequests: [] };
  const repaired = repairAiPlan(proposal, project, 'Keep the chair near the desk.', review);
  assert.ok(repaired?.adjusted);
  const checked = checkAiPlan(repaired, project, '', review);
  assert.equal(checked.ok, true);
  assert.deepEqual(usabilityIssues(checked.layout.project), []);
  assert.deepEqual(repaired.requirements, proposal.requirements);
  assert.equal(checked.layout.project.furniture.length, 4);
});

test('functional validation errors have useful, safe labels', () => {
  const error = planValidationError(['operation: wardrobe, bedside', 'facing: chair, desk']);
  assert.deepEqual(error.checks, ['operation', 'facing']);
  assert.match(error.message, /furniture opening clearance, chair and table orientation/);
});

for (const rotation of rotations) test(`bedside tables sit 10–20 cm beside the head of a bed at ${rotation} degrees`, () => {
  const bed = item('bed', 'bed', 150, 150, 100, 200, rotation);
  const table = item('bedside', 'nightstand', 0, 0, 45, 40);
  const positions = bedsidePositions(table, [bed]);
  assert.ok(positions.length);
  for (const position of positions) {
    assert.equal(besideBed(position, bed), true);
    assert.ok(furnitureGap(position, bed) >= 10 && furnitureGap(position, bed) <= 20);
  }
  assert.equal(besideBed({ ...positions[0], ...orientation((rotation + 90) % 360) }, bed), false);
});

test('a remote bedside table is flagged and a 15 cm bed-side gap overrides the generic 30 cm rule', () => {
  const bed = item('bed', 'bed', 100, 10, 100, 200);
  const table = item('bedside', 'nightstand', 215, 10, 45, 40);
  const room = source([bed, table]);
  assert.deepEqual(analyze(room).issues, []);
  table.y = 300;
  assert.ok(analyze(room).issues.some(issue => issue.type === 'bedside'));
  assert.equal(checkAiPlan(plan(room), room).ok, false);
});

test('a wardrobe cannot hide a wall TV even when the footprints and opening clearances are valid', () => {
  const tv = { ...item('tv', 'television', 475, 80, 100, 25, 90), wallMounted: true };
  const wardrobe = item('wardrobe', 'wardrobe', 370, 80, 80, 55, 90);
  const room = source([tv, wardrobe]);
  assert.equal(blocksTv(tv, wardrobe), true);
  assert.ok(analyze(room).issues.some(issue => issue.type === 'view'));
  assert.equal(checkAiPlan(plan(room), room).ok, false);
  wardrobe.y = 300;
  assert.equal(blocksTv(tv, wardrobe), false);
  assert.deepEqual(analyze(room).issues, []);
});

test('all algorithm styles keep bedside tables attached and TVs clear in the reported furniture combination', () => {
  const requests = [['bed', 100, 200], ['desk', 120, 65], ['office-chair', 65, 65], ['wardrobe', 80, 55],
    ['nightstand', 45, 40], ['television', 100, 25], ['floor-lamp', 40, 40], ['rug', 150, 120]]
    .map(([kind, width, depth]) => ({ kind, width, depth, count: 1 }));
  for (const [width, depth] of [[300, 500], [420, 360]]) {
    const room = createProject({ width, depth, door: 85, window: 155 }, requests);
    for (const layout of generateLayouts(room)) {
      assert.equal(layout.issueCount, 0, `${width} × ${depth} ${layout.name}`);
      const bed = layout.project.furniture.find(item => item.kind === 'bed');
      const table = layout.project.furniture.find(item => item.kind === 'nightstand');
      assert.equal(besideBed(table, bed), true);
      assert.equal(layout.project.furniture.length, room.furniture.length);
      assert.deepEqual(usabilityIssues(layout.project), []);
    }
  }
});
