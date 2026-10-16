import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../../src/domain/model.ts';
import { analyze, footprint, generateLayouts, overlaps } from '../../src/domain/planner.ts';
import { inaccessibleFurniture } from '../../src/domain/access.ts';
import { doorClearance, entranceZones } from '../../src/domain/openings.ts';
import { orientation, rotations, rotationOf, turnFurniture, furniturePoint } from '../../src/domain/rotation.ts';
import { isProject } from '../../src/domain/storage.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { planSchema } from '../../server/planPrompt.mjs';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({
  id, name: id, kind, x, y, width, depth, owner: 'shared', ...orientation(rotation),
});
function room() {
  return { ...defaultProject(), room: { width: 300, depth: 500, door: 85, window: 155,
    openings: [{ id: 'opening-entry', kind: 'door', wall: 'top', offset: 45, width: 85 }] }, furniture: [] };
}
const plan = project => ({ positions: project.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
  explanation: 'A proposed layout.', tips: [], requirements: [], unmetRequests: [] });

for (const rotation of rotations) {
  test(`${rotation} degree orientation preserves footprint, drawing bounds and saved data`, () => {
    const furniture = item('desk-1', 'desk', 10, 20, 100, 50, rotation);
    const rect = footprint(furniture);
    assert.equal(rect.width, rotation % 180 ? 50 : 100);
    assert.equal(rect.depth, rotation % 180 ? 100 : 50);
    const corners = [[0, 0], [100, 0], [100, 50], [0, 50]].map(([x, y]) => furniturePoint(furniture, x, y));
    assert.deepEqual([Math.min(...corners.map(p => p[0])), Math.max(...corners.map(p => p[0]))], [10, 10 + rect.width]);
    assert.deepEqual([Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[1]))], [20, 20 + rect.depth]);
    const project = room(); project.furniture = [furniture];
    assert.equal(isProject(JSON.parse(JSON.stringify(project))), true);
  });
}

test('four turns return to the original facing; legacy booleans remain readable', () => {
  let furniture = item('desk-1', 'desk', 10, 20, 100, 50);
  for (const expected of [90, 180, 270, 0]) {
    furniture = turnFurniture(furniture); assert.equal(rotationOf(furniture), expected);
  }
  assert.equal(rotationOf({ rotated: true }), 90);
  assert.equal(rotationOf({ rotated: false }), 0);
});

test('saved files reject invalid or contradictory rotation fields', () => {
  for (const rotation of [-90, 45, 360, '90', null]) {
    const project = room(); project.furniture = [{ ...item('desk-1', 'desk', 10, 200, 100, 50), rotation }];
    assert.equal(isProject(project), false);
  }
  const project = room(); project.furniture = [{ ...item('desk-1', 'desk', 10, 200, 100, 50, 180), rotated: true }];
  assert.equal(isProject(project), false);
});

test('drawer beyond the door arc is still rejected because it blocks the landing', () => {
  const project = room(); project.furniture = [item('drawers', 'dresser', 15, 95, 100, 50)];
  const swing = doorClearance(project.room, project.room.openings[0]);
  assert.equal(overlaps(footprint(project.furniture[0]), swing), false);
  assert.equal(overlaps(footprint(project.furniture[0]), entranceZones(project.room)[0]), true);
  assert.ok(analyze(project).issues.some(issue => issue.type === 'door'));
  assert.equal(checkAiPlan(plan(project), project).ok, false);
});

test('a clear swing and landing cannot hide furniture cutting off the rest of the room', () => {
  const project = room(); project.furniture = [
    item('barrier', 'desk', 0, 160, 270, 50),
    item('far-plant', 'plant', 230, 440, 35, 35),
  ];
  assert.equal(project.furniture.some(f => overlaps(footprint(f), entranceZones(project.room)[0])), false);
  assert.ok(inaccessibleFurniture(project).includes('far-plant'));
  const checked = checkAiPlan(plan(project), project);
  assert.equal(checked.ok, false);
  assert.ok(checked.problems.some(problem => problem.startsWith('access:')));
  project.furniture[0].width = 240; // A 60 cm route is now available at the right.
  assert.deepEqual(inaccessibleFurniture(project), []);
});

test('wardrobe must face reachable floor space; a reachable back does not count', () => {
  const project = room(); project.furniture = [item('wardrobe', 'wardrobe', 160, 0, 80, 55, 180)];
  assert.deepEqual(inaccessibleFurniture(project), ['wardrobe']);
  project.furniture[0] = { ...project.furniture[0], ...orientation(0) };
  assert.deepEqual(inaccessibleFurniture(project), []);
});

test('every doorway must connect to the same walking space', () => {
  const project = room(); project.room.openings.push({ id: 'opening-exit', kind: 'door', wall: 'bottom', offset: 45, width: 85 });
  project.furniture = [item('barrier', 'desk', 0, 220, 270, 50)];
  assert.ok(inaccessibleFurniture(project).length);
});

test('rugs do not block the entrance or walking routes', () => {
  const project = room(); project.furniture = [item('rug', 'rug', 0, 0, 300, 400), item('plant', 'plant', 240, 440, 35, 35)];
  assert.deepEqual(analyze(project).issues, []);
});

test('rotated carpets remain centred using their actual footprint', () => {
  for (const rotation of [90, 270]) {
    const project = room(); project.furniture = [item('rug', 'rug', 0, 0, 150, 100, rotation)];
    for (const layout of generateLayouts(project)) {
      const rect = footprint(layout.project.furniture[0]);
      assert.equal(rect.x + rect.width / 2, project.room.width / 2);
      assert.equal(rect.y + rect.depth / 2, project.room.depth / 2);
    }
  }
});

test('landing is inside the room for every wall', () => {
  for (const wall of ['top', 'right', 'bottom', 'left']) {
    const project = room(); project.room.openings[0].wall = wall;
    const zone = entranceZones(project.room)[0];
    assert.equal(wall === 'top' || wall === 'bottom' ? zone.depth : zone.width, 145);
    assert.ok(zone.x >= 0 && zone.y >= 0 && zone.x + zone.width <= 300 && zone.y + zone.depth <= 500);
  }
});

test('AI schema supports all four directions and normalized plans retain 180/270 degrees', () => {
  const project = room(); project.furniture = [item('desk', 'desk', 170, 220, 100, 50)];
  assert.deepEqual(planSchema(project).properties.positions.items.properties.rotation.enum, rotations);
  for (const rotation of [180, 270]) {
    const proposal = plan(project); proposal.positions[0].rotation = rotation;
    const checked = checkAiPlan(proposal, project);
    assert.equal(checked.ok, true);
    assert.equal(checked.layout.project.furniture[0].rotation, rotation);
    assert.equal(isProject(checked.layout.project), true);
  }
});

test('repair moves entrance-blocking drawers while preserving furniture and dimensions', () => {
  const project = room(); project.furniture = [item('drawers', 'dresser', 15, 95, 100, 50), item('plant', 'plant', 240, 440, 35, 35)];
  const repaired = repairAiPlan(plan(project), project);
  assert.ok(repaired);
  const checked = checkAiPlan(repaired, project);
  assert.equal(checked.ok, true);
  assert.equal(checked.layout.project.furniture.length, project.furniture.length);
  assert.deepEqual(checked.layout.project.furniture.map(f => [f.id, f.width, f.depth]), project.furniture.map(f => [f.id, f.width, f.depth]));
});

test('local suggestions preserve usable entrance access in the reported 3 by 5 metre room', () => {
  const project = room(); project.furniture = [
    item('bed', 'double-bed', 130, 15, 160, 200), item('drawers', 'dresser', 15, 95, 100, 50),
    item('bedside', 'nightstand', 85, 145, 45, 40), item('wardrobe', 'wardrobe', 210, 215, 80, 55),
    item('desk', 'desk', 15, 425, 120, 50), item('plant', 'plant', 240, 460, 35, 35),
  ];
  for (const layout of generateLayouts(project)) {
    assert.equal(layout.issueCount, 0, layout.name);
    assert.deepEqual(inaccessibleFurniture(layout.project), []);
    assert.equal(layout.project.furniture.length, project.furniture.length);
  }
});
