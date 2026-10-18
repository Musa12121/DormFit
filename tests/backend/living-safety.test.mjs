import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../src/domain/model.ts';
import { createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { furnitureEntranceZones, entranceZones } from '../../src/domain/openings.ts';
import { footprint, overlaps } from '../../src/domain/geometry.ts';
import { validWallMount } from '../../src/domain/mounting.ts';
import { isProject } from '../../src/domain/storage.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';
import { livingPlan } from '../living-plan-fixture.mjs';

function livingRoom(count = 10) {
  const counts = { sofa: 2, chair: count, rug: 1, 'dining-table': 1, 'tv-stand': 1 };
  return createProject({ width: 400, depth: 500, door: 85, window: 155, openings: [
    { id: 'opening-door', kind: 'door', wall: 'right', offset: 50, width: 85 },
    { id: 'opening-left', kind: 'window', wall: 'left', offset: 70, width: 200 },
    { id: 'opening-bottom', kind: 'window', wall: 'bottom', offset: 150, width: 170 },
  ] }, catalog.filter(item => counts[item.kind]).map(item => ({ ...item, count: counts[item.kind] })));
}
const plan = source => ({ positions: source.furniture.map(({ id }, i) => ({ id, x: 10 + i * 5, y: 10 + i * 5, rotation: 0 })),
  requirements: [], unmetRequests: [], explanation: 'A living and dining room.', tips: [] });
function verifyPartial(result, source) {
  assert.deepEqual(analyze(result).issues, []);
  const placed = result.furniture.filter(item => item.kind === 'chair');
  assert.ok(placed.length > 0);
  assert.ok(result.omittedChairs.length > 0);
  assert.equal(placed.length + result.omittedChairs.length, source.furniture.filter(item => item.kind === 'chair').length);
  assert.deepEqual(result.furniture.filter(item => item.kind !== 'chair').map(item => item.id),
    source.furniture.filter(item => item.kind !== 'chair').map(item => item.id));
  const all = [...result.furniture, ...result.omittedChairs];
  assert.equal(new Set(all.map(item => item.id)).size, source.furniture.length);
  for (const item of all) {
    const original = source.furniture.find(other => other.id === item.id);
    assert.equal(item.width, original.width); assert.equal(item.depth, original.depth);
  }
  assert.ok(isProject(JSON.parse(JSON.stringify(result))), 'Omission reporting must survive saving/import');
  const tv = result.furniture.find(item => item.kind === 'tv-stand');
  assert.ok(furnitureEntranceZones(result.room, tv).every(zone => !overlaps(zone, footprint(tv))));
}

test('ordinary chairs default to 45 × 45 cm without changing custom or saved sizes', () => {
  const chair = catalog.find(item => item.kind === 'chair');
  assert.equal(chair.width, 45); assert.equal(chair.depth, 45);
  const source = createProject({ width: 400, depth: 500, door: 85, window: 155 }, [{ ...chair, width: 52, depth: 58, count: 1 }]);
  for (const layout of generateLayouts(source)) {
    assert.equal(layout.project.furniture[0].width, 52); assert.equal(layout.project.furniture[0].depth, 58);
  }
});

for (const wall of ['top', 'right', 'bottom', 'left']) test(`TV stands and mounted TVs keep a buffer beyond the ${wall} door swing`, () => {
  const room = { width: 500, depth: 500, door: 85, window: 155, openings: [{ id: 'opening-door', kind: 'door', wall, offset: 150, width: 85 }] };
  const zone = entranceZones(room)[0], horizontal = wall === 'top' || wall === 'bottom';
  const tv = { id: 'tv-stand-1', kind: 'tv-stand', name: 'TV stand', width: 80, depth: 30, owner: 'shared', rotated: false,
    x: horizontal ? zone.x + zone.width + 5 : zone.x + 20, y: horizontal ? zone.y + 20 : zone.y + zone.depth + 5 };
  assert.ok(!overlaps(footprint(tv), zone), 'Previously the stand just outside the swing passed');
  assert.ok(analyze({ version: 1, name: 'Room', room, furniture: [tv] }).issues.some(issue => issue.type === 'door'));
  const mounted = { ...tv, kind: 'television', width: 80, depth: 25, rotation: { top: 0, right: 90, bottom: 180, left: 270 }[wall],
    rotated: !horizontal, x: horizontal ? 240 : wall === 'right' ? 475 : 0, y: horizontal ? wall === 'bottom' ? 475 : 0 : 240 };
  assert.equal(validWallMount(mounted, room), false);
  if (horizontal) mounted.x = 255; else mounted.y = 255;
  assert.equal(validWallMount(mounted, room), true, 'Exactly 20 cm beyond the swing is allowed');
});

test('every algorithm layout removes unfitted chairs and keeps the side-door TV safe', () => {
  const source = livingRoom(); const snapshot = JSON.stringify(source);
  for (const layout of generateLayouts(source)) verifyPartial(layout.project, source);
  assert.equal(JSON.stringify(source), snapshot);
});

test('a door cannot swing into the screen viewing area even when the stand itself is out of reach', () => {
  const tv = { id: 'tv-stand-1', kind: 'tv-stand', name: 'TV stand', width: 100, depth: 40,
    x: 150, y: 250, owner: 'shared', rotated: false, rotation: 0 };
  const room = { width: 500, depth: 500, door: 85, window: 155 };
  assert.ok(furnitureEntranceZones(room, tv).every(zone => !overlaps(zone, footprint(tv))));
  assert.ok(analyze({ version: 1, name: 'Room', room, furniture: [tv] }).issues.some(issue => issue.type === 'view'));
});

test('AI returns a safe partial chair set with explicit omitted IDs through the mocked endpoint', async () => {
  const source = livingRoom();
  let calls = 0;
  const response = await getLayoutAdvice({ project: source, prompt: '' }, { apiKey: 'fake-test-key', model: 'fake-model' }, async () => {
    calls++;
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(livingPlan(source)) }] } }] });
  });
  assert.equal(calls, 1);
  const checked = checkAiPlan(response, source);
  assert.equal(checked.ok, true);
  verifyPartial(checked.layout.project, source);
  assert.deepEqual(new Set(response.omittedChairIds), new Set(checked.layout.project.omittedChairs.map(item => item.id)));
  const original = livingPlan(source);
  const restored = response.positions.length > original.positions.length;
  if (restored) assert.equal(response.adjusted, true, 'Disclose a rearrangement that restores additional chairs');
  for (const proposed of original.positions.filter(position => position.id !== 'rug-1' && !restored)) {
    const actual = response.positions.find(position => position.id === proposed.id);
    assert.equal(actual.x, proposed.x, `${proposed.id} must keep its AI position`);
    assert.equal(actual.y, proposed.y, `${proposed.id} must keep its AI position`);
  }
});

test('omission validation allows only reported chairs, with no duplicate, invented or silently missing IDs', () => {
  const source = createProject({ width: 300, depth: 300, door: 85, window: 155 }, [
    { kind: 'plant', width: 35, depth: 35, count: 1 }, { kind: 'chair', width: 400, depth: 400, count: 1 },
  ]);
  const partial = { ...plan(source), positions: [{ id: 'plant-1', x: 0, y: 0, rotation: 0 }], omittedChairIds: ['chair-1'] };
  const checked = checkAiPlan(partial, source);
  assert.equal(checked.ok, true);
  assert.equal(checked.layout.project.furniture.length, 1);
  for (const mutation of [
    { omittedChairIds: [] }, { omittedChairIds: ['invented'] }, { omittedChairIds: ['plant-1'] },
    { omittedChairIds: ['chair-1', 'chair-1'] }, { positions: [...partial.positions, { id: 'chair-1', x: 0, y: 0, rotation: 0 }] },
  ]) assert.equal(checkAiPlan({ ...partial, ...mutation }, source).ok, false);
  assert.equal(isProject({ ...checked.layout.project, omittedChairs: [source.furniture[0]] }), false);
  assert.equal(isProject({ ...checked.layout.project, omittedChairs: [source.furniture[0], source.furniture[1]] }), false);
  const repaired = repairAiPlan(plan(source), source);
  assert.deepEqual(repaired.omittedChairIds, ['chair-1']);
  const protectedPlan = { ...plan(source), requirements: [{ itemId: 'chair-1', targetId: 'plant-1', relation: 'near' }] };
  assert.equal(repairAiPlan(protectedPlan, source, 'Put the chair near the plant.'), null);
  const small = { ...source, furniture: source.furniture.map(item => item.kind === 'chair' ? { ...item, width: 45, depth: 45 } : item) };
  const restored = repairAiPlan(partial, small);
  assert.ok(restored);
  assert.equal(restored.omittedChairIds, undefined, 'Restore a model-omitted chair when the full set fits');
});
