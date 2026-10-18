import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, emptyProject, getFurnitureRequests } from '../../src/domain/setup.ts';
import { isProject } from '../../src/domain/storage.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { rotateWallTv, validWallMount, wallTvPositions } from '../../src/domain/mounting.ts';
import { rotationOf } from '../../src/domain/rotation.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';
import { fakeConfig } from './helpers.mjs';

const television = (patch = {}) => ({ id: 'tv-1', kind: 'television', name: 'TV', width: 100,
  depth: 25, x: 0, y: 0, rotated: false, owner: 'shared', wallMounted: true, ...patch });
const proposal = project => ({ positions: project.furniture.map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotated, rotation })),
  requirements: [], unmetRequests: [], explanation: 'A wall-mounted television.', tips: [] });

test('the wall TV is mounted automatically and older mounting fields remain readable', () => {
  const source = createProject(emptyProject().room, [{ kind: 'television', count: 1, width: 100, depth: 25, wallMounted: true }]);
  const saved = JSON.parse(JSON.stringify(source));
  assert.equal(isProject(saved), true);
  assert.equal(getFurnitureRequests(saved).find(request => request.kind === 'television').wallMounted, true);
  const old = { ...saved, furniture: [television({ wallMounted: undefined })] };
  assert.equal(isProject(old), true);
  assert.equal(getFurnitureRequests(old).find(request => request.kind === 'television').wallMounted, true);
  for (const wallMounted of [1, 'true', null]) assert.equal(isProject({ ...saved, furniture: [television({ wallMounted })] }), false);
  assert.equal(isProject({ ...saved, furniture: [television({ kind: 'tv-stand' })] }), false);
});

test('mounting candidates face inward on all four walls and avoid windows and doors', () => {
  const room = emptyProject().room;
  const positions = wallTvPositions(television(), room);
  assert.deepEqual([...new Set(positions.map(rotationOf))].sort((a, b) => a - b), [0, 90, 180, 270]);
  assert.ok(positions.every(item => validWallMount(item, room)));
  assert.equal(validWallMount(television({ x: 150 }), room), false, 'Cannot cover the top window');
  assert.equal(validWallMount(television({ y: 20 }), room), false, 'The TV back must meet a wall');
  assert.equal(validWallMount(television({ x: 180, y: 335, rotation: 180 }), room), false, 'Cannot cover the door');
});

test('TV rotation skips a wall where the window leaves no mounting space', () => {
  const room = { ...emptyProject().room, width: 300, depth: 500 };
  const current = television({ x: 0, y: 10, rotation: 270, rotated: true });
  const next = rotateWallTv(current, room);
  assert.equal(next.rotation, 90, 'The top wall cannot fit this TV, so move to the right wall');
  assert.equal(validWallMount(next, room), true);
});

test('wall TVs use no floor area or furniture gap, while TV stands do', () => {
  const room = emptyProject();
  const desk = { ...television(), id: 'desk', kind: 'desk', width: 120, depth: 65, wallMounted: undefined };
  room.furniture = [desk, television()];
  assert.deepEqual(analyze(room).issues, []);
  assert.equal(analyze(room).occupied, .78);
  assert.equal(checkAiPlan(proposal(room), room).ok, true);
  for (const patch of [{ kind: 'tv-stand', wallMounted: undefined }]) {
    room.furniture[1] = television(patch);
    assert.ok(analyze(room).issues.some(issue => issue.type === 'overlap'));
  }
});

test('local layouts place multiple mounted TVs on clear wall segments without losing furniture', () => {
  const source = createProject(emptyProject().room, [
    { kind: 'desk', count: 1, width: 120, depth: 65 },
    { kind: 'television', count: 2, width: 100, depth: 25, wallMounted: true },
    { kind: 'tv-stand', count: 1, width: 140, depth: 40 },
  ]);
  const before = structuredClone(source);
  for (const layout of generateLayouts(source)) {
    assert.equal(layout.issueCount, 0);
    assert.equal(layout.project.furniture.length, 4);
    assert.ok(layout.project.furniture.filter(item => item.wallMounted).every(item => validWallMount(item, source.room)));
    assert.equal(layout.project.furniture.find(item => item.kind === 'tv-stand').wallMounted, undefined);
  }
  assert.deepEqual(source, before);
});

test('AI repair moves a floating TV to a wall and preserves its mounting choice', () => {
  const source = { ...emptyProject(), furniture: [television({ x: 150, y: 150 })] };
  const bad = proposal(source);
  assert.equal(checkAiPlan(bad, source).ok, false);
  const repaired = repairAiPlan(bad, source);
  assert.ok(repaired?.adjusted);
  const checked = checkAiPlan(repaired, source);
  assert.equal(checked.ok, true);
  assert.equal(checked.layout.project.furniture[0].wallMounted, true);
  assert.equal(validWallMount(checked.layout.project.furniture[0], source.room), true);
});

test('wall-mounted televisions cannot overlap one another or cover fully occupied walls', () => {
  const source = { ...emptyProject(), furniture: [television(), television({ id: 'tv-2' })] };
  assert.ok(analyze(source).issues.some(issue => issue.type === 'overlap'));
  source.room.openings = ['top', 'right', 'bottom', 'left'].map(wall => ({ id: `opening-${wall}`, kind: 'window', wall,
    offset: 0, width: wall === 'top' || wall === 'bottom' ? source.room.width : source.room.depth }));
  assert.deepEqual(wallTvPositions(source.furniture[0], source.room), []);
  assert.equal(repairAiPlan(proposal(source), source), null);
  assert.ok(generateLayouts(source).every(layout => layout.issueCount > 0 && layout.project.furniture.length === 2));
});

test('Gemini receives mounting choices and returns the same requested furniture only', async () => {
  const source = { ...emptyProject(), furniture: [television()] };
  const result = await getLayoutAdvice({ project: source, prompt: '' }, fakeConfig, async (_url, options) => {
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.contents[0].parts[0].text);
    assert.equal(input.furniture[0].wallMounted, true);
    assert.match(request.systemInstruction.parts[0].text, /A desk includes no chair/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal(source)) }] } }] });
  });
  assert.equal(result.positions.length, 1);
});
