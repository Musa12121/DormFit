import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../src/domain/setup.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';

function project() {
  const items = [['bed', 100, 200], ['desk', 120, 65], ['office-chair', 65, 65], ['wardrobe', 80, 55],
    ['nightstand', 45, 40], ['television', 100, 25], ['floor-lamp', 40, 40], ['rug', 150, 120]];
  return createProject({ width: 300, depth: 500, door: 85, window: 155 },
    items.map(([kind, width, depth]) => ({ kind, width, depth, count: 1 })));
}
const requirements = [
  { itemId: 'bed-1', targetId: 'door', relation: 'away' },
  { itemId: 'desk-1', targetId: 'window', relation: 'near' },
  { itemId: 'office-chair-1', targetId: 'desk-1', relation: 'near' },
];
const note = 'Keep the bed away from the door and the desk near the window, with its chair nearby.';
const proposal = (source, x, y, rules) => ({
  positions: [
    ['bed-1', 100, 250, 90], ['nightstand-1', 260, 370, 90], ['television-1', 0, 310, 270],
    ['desk-1', 180, 60, 0], ['office-chair-1', x, y, 0], ['wardrobe-1', 52.5, 420, 270],
    ['floor-lamp-1', 260, 460, 0], ['rug-1', 150, 380, 0],
  ].map(([id, x, y, rotation]) => ({ id, x, y, rotation })),
  requirements: rules, unmetRequests: [], explanation: 'A proposed sleeping and working area.', tips: [],
});

for (const [x, y] of [[207.5, 150], [217.5, 155], [197.5, 165]]) for (const withNote of [false, true]) {
  test(`repairs a working-chair position at ${x},${y}, ${withNote ? 'preserving confirmed notes' : 'without notes'}`, () => {
    const source = project();
    const plan = proposal(source, x, y, withNote ? requirements : []);
    const prompt = withNote ? note : '';
    const review = withNote ? { requirements, unmetRequests: [] } : undefined;
    const snapshot = structuredClone({ source, plan });
    assert.equal(checkAiPlan(plan, source, prompt, review).ok, false);
    const repaired = repairAiPlan(plan, source, prompt, review);
    assert.ok(repaired, 'Repair the companion relative to the proposed table');
    const checked = checkAiPlan(repaired, source, prompt, review);
    assert.equal(checked.ok, true);
    assert.equal(repaired.adjusted, true);
    assert.deepEqual(repaired.requirements, plan.requirements);
    assert.deepEqual(checked.layout.project.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth })),
      source.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth })));
    assert.deepEqual({ source, plan }, snapshot, 'Repair must not mutate the model response or source');
  });
}

test('the AI endpoint repairs combined geometry failures without a second paid attempt or dropping notes', async () => {
  const source = project();
  const plan = proposal(source, 217.5, 155, requirements);
  const review = { requirements, unmetRequests: [] };
  let calls = 0;
  const repaired = await getLayoutAdvice({ project: source, prompt: note, review },
    { apiKey: 'fake-test-key', model: 'fake-model' }, async () => {
      calls++;
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(plan) }] } }] });
    });
  assert.equal(calls, 1);
  assert.equal(repaired.adjusted, true);
  assert.deepEqual(repaired.requirements, requirements);
  assert.equal(checkAiPlan(repaired, source, note, review).ok, true);
});
