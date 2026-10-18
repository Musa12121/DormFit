import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../src/domain/model.ts';
import { createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts, similarLayouts } from '../../src/domain/planner.ts';
import { canWatchFromSofa, functionalPlacementAllowed } from '../../src/domain/usability.ts';
import { footprint } from '../../src/domain/geometry.ts';
import { orientation } from '../../src/domain/rotation.ts';
import { alignSeatingRugs } from '../../src/domain/lounge.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';
import { livingPlan } from '../living-plan-fixture.mjs';

const item = (id, kind, x, y, width, depth, rotation = 0) => ({ id, kind, name: id,
  x, y, width, depth, owner: 'shared', ...orientation(rotation) });
const room = { width: 1200, depth: 1200, door: 85, window: 155, openings: [] };
const source = furniture => ({ version: 1, name: 'Living room', room, furniture });
const plan = project => ({ positions: project.furniture.map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotation: rotation ?? (rotated ? 90 : 0) })),
  requirements: [], unmetRequests: [], explanation: 'A seating arrangement.', tips: [] });
const rotate = furniture => furniture.map(piece => {
  const rect = footprint(piece);
  return { ...piece, x: room.width - rect.y - rect.depth, y: rect.x, ...orientation((piece.rotation + 90) % 360) };
});

for (let turns = 0; turns < 4; turns++) test(`sofa viewing checks every seat and screen direction at ${turns * 90} degrees`, () => {
  let furniture = [item('sofa-1', 'sofa', 100, 200, 200, 90), item('tv-1', 'tv-stand', 130, 600, 140, 40, 180)];
  for (let step = 0; step < turns; step++) furniture = rotate(furniture);
  const [sofa, tv] = furniture;
  assert.equal(canWatchFromSofa(sofa, tv, furniture), true);
  assert.equal(canWatchFromSofa({ ...sofa, ...orientation((sofa.rotation + 180) % 360) }, tv), false);
  assert.equal(canWatchFromSofa(sofa, { ...tv, ...orientation((tv.rotation + 180) % 360) }), false);
});

test('a TV immediately beside the sofa is rejected instead of passing footprint checks', () => {
  const sofa = item('sofa-1', 'sofa', 100, 200, 200, 90);
  const tv = item('tv-1', 'tv-stand', 400, 220, 140, 40, 90);
  const project = source([sofa, tv]);
  assert.equal(canWatchFromSofa(sofa, tv, project.furniture), false);
  assert.ok(analyze(project).issues.some(issue => issue.type === 'view' && issue.ids.includes(sofa.id)));
  assert.equal(checkAiPlan(plan(project), project).ok, false);
});

test('another sofa blocks the rear viewers even when both sofas face the TV', () => {
  const back = item('sofa-1', 'sofa', 100, 200, 200, 90);
  const front = item('sofa-2', 'sofa', 100, 400, 200, 90);
  const tv = item('tv-1', 'tv-stand', 130, 600, 140, 40, 180);
  const project = source([back, front, tv]);
  assert.equal(canWatchFromSofa(front, tv, project.furniture), true);
  assert.equal(canWatchFromSofa(back, tv, project.furniture), false);
  assert.equal(functionalPlacementAllowed(tv, room, [back, front]), false);
  assert.ok(analyze(project).issues.some(issue => issue.type === 'view' && issue.ids[0] === back.id));
});

test('one blocked end seat invalidates an otherwise visible sofa', () => {
  const sofa = item('sofa-1', 'sofa', 100, 200, 200, 90);
  const tv = item('tv-1', 'tv-stand', 130, 600, 140, 40, 180);
  const blocker = item('cabinet-1', 'wardrobe', 120, 340, 35, 40);
  assert.equal(canWatchFromSofa(sofa, tv), true);
  assert.equal(canWatchFromSofa(sofa, tv, [sofa, tv, blocker]), false);
});

function furnishedRoom() {
  const counts = { sofa: 2, chair: 6, rug: 1, 'dining-table': 1, 'tv-stand': 1 };
  return createProject({ width: 400, depth: 500, door: 85, window: 155, openings: [
    { id: 'opening-door', kind: 'door', wall: 'right', offset: 50, width: 85 },
    { id: 'opening-left', kind: 'window', wall: 'left', offset: 70, width: 200 },
    { id: 'opening-bottom', kind: 'window', wall: 'bottom', offset: 150, width: 170 },
  ] }, catalog.filter(piece => counts[piece.kind]).map(piece => ({ ...piece, count: counts[piece.kind] })));
}
test('every algorithm option gives both sofas an unobstructed TV view in the reported room', () => {
  const project = furnishedRoom();
  const options = generateLayouts(project);
  assert.equal(options.length, 3, 'Offer three different safe arrangements in the reported room');
  const concepts = options.map(option => {
    const tv = option.project.furniture.find(piece => piece.kind === 'tv-stand');
    const directions = [...new Set(option.project.furniture.filter(piece => piece.kind === 'sofa').map(piece => piece.rotation))].sort();
    return `${tv.rotation}:${directions.join(',')}`;
  });
  assert.equal(new Set(concepts).size, 3, 'The sofa/screen orientation and seating pattern must change, not just the table');
  for (const [index, option] of options.entries()) {
    for (const other of options.slice(0, index)) assert.equal(similarLayouts(option.project, other.project), false,
      'Swapping sofa IDs or turning only the dining table does not create a different arrangement');
    assert.deepEqual(analyze(option.project).issues, []);
    const tv = option.project.furniture.find(piece => piece.kind === 'tv-stand');
    const sofas = option.project.furniture.filter(piece => piece.kind === 'sofa');
    assert.equal(sofas.length, 2);
    assert.ok(sofas.every(sofa => canWatchFromSofa(sofa, tv, option.project.furniture)));
    assert.equal(option.project.furniture.length + (option.project.omittedChairs?.length ?? 0), project.furniture.length);
  }
});

test('moving only the dining table does not make another living-room layout', () => {
  const project = source([item('sofa-1', 'sofa', 100, 100, 200, 90),
    item('tv-1', 'tv-stand', 130, 600, 140, 40, 180), item('table-1', 'dining-table', 700, 700, 140, 80)]);
  const moved = structuredClone(project);
  moved.furniture.find(item => item.kind === 'dining-table').x -= 400;
  assert.equal(similarLayouts(project, moved), true);
});

test('swapped identical sofa IDs, a reversed dining table and a shifted rug are the same arrangement', () => {
  const project = source([item('sofa-1', 'sofa', 100, 100, 200, 90), item('sofa-2', 'sofa', 330, 100, 200, 90),
    item('table-1', 'dining-table', 700, 700, 140, 80), item('rug-1', 'rug', 100, 300, 150, 120)]);
  const other = structuredClone(project);
  [other.furniture[0].id, other.furniture[1].id] = [other.furniture[1].id, other.furniture[0].id];
  other.furniture[2] = { ...other.furniture[2], ...orientation(180) };
  other.furniture[3].x += 100;
  assert.equal(similarLayouts(project, other), true);
  other.furniture[2].x += 100;
  assert.equal(similarLayouts(project, other), false);
});

test('rugs align with the shared seating space; explicitly requested rug positions stay intact', () => {
  const project = source([item('sofa-1', 'sofa', 100, 100, 200, 90), item('sofa-2', 'sofa', 330, 100, 200, 90),
    item('tv-1', 'tv-stand', 240, 600, 140, 40, 180), item('rug-1', 'rug', 10, 10, 150, 120)]);
  const rug = alignSeatingRugs(project).furniture.find(piece => piece.kind === 'rug');
  assert.equal(rug.x + rug.width / 2, 315);
  assert.equal(rug.y + rug.depth / 2, 395);
  assert.deepEqual(alignSeatingRugs(project, new Set(['rug-1'])).furniture.at(-1), project.furniture.at(-1));
  const response = repairAiPlan(plan(project), project);
  assert.equal(response.adjusted, true);
  assert.equal(response.positions.find(position => position.id === 'rug-1').x, rug.x);
  const pinned = { ...plan(project), requirements: [{ itemId: 'rug-1', targetId: 'left-wall', relation: 'near' }] };
  assert.equal(repairAiPlan(pinned, project, 'Put the rug near the left wall.').positions.find(position => position.id === 'rug-1').x, 10);
});

test('the mocked AI endpoint preserves valid living-room views and centres the carpet', async () => {
  const project = furnishedRoom(); const bad = livingPlan(project);
  bad.positions.find(position => position.id === 'rug-1').x = 5;
  let calls = 0;
  const response = await getLayoutAdvice({ project, prompt: '' }, { apiKey: 'fake-test-key', model: 'fake-model' }, async () => {
    calls++;
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(bad) }] } }] });
  });
  assert.equal(calls, 1);
  const checked = checkAiPlan(response, project);
  assert.equal(checked.ok, true);
  const tv = checked.layout.project.furniture.find(piece => piece.kind === 'tv-stand');
  assert.ok(checked.layout.project.furniture.filter(piece => piece.kind === 'sofa').every(sofa => canWatchFromSofa(sofa, tv, checked.layout.project.furniture)));
  const restored = response.positions.length > bad.positions.length;
  if (restored) assert.equal(response.adjusted, true, 'Disclose a rearrangement that restores additional chairs');
  for (const proposed of bad.positions.filter(position => position.id !== 'rug-1' && !restored)) {
    const actual = response.positions.find(position => position.id === proposed.id);
    assert.equal(actual.x, proposed.x);
    assert.equal(actual.y, proposed.y);
    assert.equal(actual.rotation, proposed.rotation);
  }
});

for (const withNote of [false, true]) test(`joint AI repair corrects viewing, facing, door and overlap faults ${withNote ? 'with the window note' : 'without a note'}`, async () => {
  const project = furnishedRoom();
  const bad = livingPlan(project);
  bad.omittedChairIds = [];
  bad.positions.push({ ...bad.positions.find(position => position.id === 'chair-1'), id: 'chair-6' });
  bad.positions.find(position => position.id === 'sofa-1').rotation = 90;
  bad.positions.find(position => position.id === 'chair-2').rotation = 270;
  bad.positions.find(position => position.id === 'tv-stand-1').y = 60;
  const prompt = withNote ? 'Place the dining table near the window.' : '';
  if (withNote) bad.requirements = [{ itemId: 'dining-table-1', targetId: 'window', relation: 'near' }];
  const review = withNote ? { requirements: bad.requirements, unmetRequests: [] } : undefined;
  const before = checkAiPlan(bad, project, prompt, review);
  assert.equal(before.ok, false);
  for (const type of ['view:', 'facing:', 'overlap:', 'door:']) assert.ok(before.problems.some(problem => problem.startsWith(type)));
  let calls = 0;
  const response = await getLayoutAdvice({ project, prompt, ...(review ? { review } : {}) },
    { apiKey: 'fake-test-key', model: 'fake-model' }, async () => {
      calls++;
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(bad) }] } }] });
    });
  assert.equal(calls, 1);
  const checked = checkAiPlan(response, project, prompt, review);
  assert.equal(checked.ok, true);
  assert.deepEqual(analyze(checked.layout.project).issues, []);
  assert.deepEqual(response.requirements, bad.requirements);
  assert.equal(checked.layout.project.furniture.length + (checked.layout.project.omittedChairs?.length ?? 0), project.furniture.length);
  assert.equal(checked.layout.project.furniture.filter(piece => piece.kind === 'sofa').length, 2);
});
