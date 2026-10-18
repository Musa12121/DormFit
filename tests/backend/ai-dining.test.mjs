import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../src/domain/model.ts';
import { createProject } from '../../src/domain/setup.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';
import { analyze } from '../../src/domain/planner.ts';
import { inaccessibleFurniture } from '../../src/domain/access.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { facesTable } from '../../src/domain/usability.ts';
import { getLayoutAdvice } from '../../server/gemini.mjs';
import { orientation } from '../../src/domain/rotation.ts';

const counts = { sofa: 2, chair: 6, rug: 1, 'dining-table': 1, 'tv-stand': 1 };
const source = () => createProject({ width: 400, depth: 500, door: 85, window: 155 },
  catalog.filter(item => counts[item.kind]).map(item => ({ ...item, count: counts[item.kind] })));
const proposal = (project, x, y) => ({
  positions: [
    ['rug-1', 170, 150, 270], ['sofa-1', 10, 10, 270], ['sofa-2', 10, 240, 270],
    ['chair-1', x, y, 180], ['chair-2', 355, 230, 0], ['chair-3', 260, 385, 180],
    ['chair-4', 355, 385, 180], ['chair-5', 200, 307.5, 270],
    ['dining-table-1', 260, 290, 0], ['tv-stand-1', 360, 30, 90],
  ].map(([id, x, y, rotation]) => ({ id, x, y, rotation })),
  omittedChairIds: ['chair-6'],
  requirements: [], unmetRequests: [], explanation: 'A living and dining room.', tips: [],
});
function verify(result, project, prompt = '', review) {
  const checked = checkAiPlan(result, project, prompt, review);
  assert.equal(checked.ok, true);
  const layout = checked.layout.project;
  assert.deepEqual(analyze(layout).issues, []);
  assert.deepEqual(inaccessibleFurniture(layout), []);
  assert.equal(layout.furniture.length + (layout.omittedChairs?.length ?? 0), 11);
  const table = layout.furniture.find(item => item.kind === 'dining-table');
  assert.ok(layout.furniture.filter(item => item.kind === 'chair').every(chair => facesTable(chair, table)));
  const requested = project.furniture.map(item => [...layout.furniture, ...(layout.omittedChairs ?? [])].find(other => other.id === item.id));
  assert.deepEqual(requested.map(({ id, width, depth }) => ({ id, width, depth })),
    project.furniture.map(({ id, width, depth }) => ({ id, width, depth })));
  assert.equal(result.adjusted, true);
}

for (const [x, y] of [[260, 220], [270, 230], [260, 240]]) {
  test(`repairs a misplaced dining chair at ${x},${y} in the no-note 4 × 5 m set`, () => {
    const project = source();
    const plan = proposal(project, x, y);
    const snapshot = structuredClone({ project, plan });
    assert.equal(checkAiPlan(plan, project).ok, false);
    const repaired = repairAiPlan(plan, project);
    assert.ok(repaired);
    verify(repaired, project);
    assert.deepEqual({ project, plan }, snapshot);
  });
}

test('the endpoint accounts for every dining-set item after one mocked AI response without a note', async () => {
  const project = source();
  let calls = 0;
  const result = await getLayoutAdvice({ project, prompt: '' }, { apiKey: 'fake-test-key', model: 'fake-model' }, async () => {
    calls++;
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal(project, 260, 220)) }] } }] });
  });
  assert.equal(calls, 1);
  verify(result, project);
});

test('dining group repair preserves confirmed placement notes', () => {
  const project = source();
  const plan = proposal(project, 260, 220);
  plan.requirements = [{ itemId: 'dining-table-1', targetId: 'door', relation: 'away' }];
  const review = { requirements: plan.requirements, unmetRequests: [] };
  const note = 'Keep the dining table away from the entrance.';
  const result = repairAiPlan(plan, project, note, review);
  assert.ok(result);
  assert.deepEqual(result.requirements, review.requirements);
  verify(result, project, note, review);
});

test('a table surrounded by chairs is reachable through its seats, but backwards chairs do not provide access', () => {
  const project = source();
  project.room = { ...project.room, width: 600, depth: 600 };
  project.furniture = project.furniture.filter(item => item.kind === 'chair' || item.kind === 'dining-table');
  const positions = [[220, 180, 0], [310, 180, 0], [220, 345, 180], [310, 345, 180], [150, 265, 270], [375, 265, 90]];
  let seat = 0;
  project.furniture = project.furniture.map(item => {
    const [x, y, rotation] = item.kind === 'dining-table' ? [220, 250, 0] : positions[seat++];
    return { ...item, x, y, ...orientation(rotation) };
  });
  assert.deepEqual(analyze(project).issues, []);
  assert.deepEqual(inaccessibleFurniture(project), []);
  const backwards = { ...project, furniture: project.furniture.map(item => item.kind === 'chair'
    ? { ...item, ...orientation((item.rotation + 180) % 360) } : item) };
  assert.ok(inaccessibleFurniture(backwards).includes('dining-table-1'));
});
