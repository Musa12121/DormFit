import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../../src/domain/model.ts';
import { getOpenings, openingSegment, doorClearance, doorZones, openingsProblem } from '../../src/domain/openings.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { isProject } from '../../src/domain/storage.ts';
import { checkAiPlan, requirementDistance, isPreferenceReview } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { getLayoutAdvice, getPreferenceReview } from '../../server/gemini.mjs';
import { plantProject, plantPlan } from '../ai-fixtures.mjs';
import { startApp, fakeConfig } from './helpers.mjs';

const result = (value) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
const review = () => ({ requirements: plantPlan().requirements, unmetRequests: [] });

test('older files retain their centred door and window', () => {
  const room = defaultProject().room;
  assert.deepEqual(getOpenings(room).map(({ wall, offset, width }) => ({ wall, offset, width })), [
    { wall: 'bottom', offset: 167.5, width: 85 }, { wall: 'top', offset: 132.5, width: 155 },
  ]);
  assert.equal(isProject(defaultProject()), true);
});

for (const [wall, segment, clearance] of [
  ['top', { x: 50, y: 0, width: 80, depth: 0 }, { x: 50, y: 0, width: 80, depth: 80 }],
  ['bottom', { x: 50, y: 360, width: 80, depth: 0 }, { x: 50, y: 280, width: 80, depth: 80 }],
  ['left', { x: 0, y: 50, width: 0, depth: 80 }, { x: 0, y: 50, width: 80, depth: 80 }],
  ['right', { x: 420, y: 50, width: 0, depth: 80 }, { x: 340, y: 50, width: 80, depth: 80 }],
]) {
  test(`${wall} wall segments and door clearance use the actual position`, () => {
    const room = defaultProject().room;
    const opening = { id: 'opening-test', kind: 'door', wall, width: 80, offset: 50 };
    assert.deepEqual(openingSegment(room, opening), segment);
    assert.deepEqual(doorClearance(room, opening), clearance);
    const source = defaultProject(); source.room.openings = [opening]; source.furniture = [
      { ...source.furniture[0], x: clearance.x, y: clearance.y, width: 20, depth: 20 },
    ];
    assert.equal(analyze(source).issues.some((issue) => issue.type === 'door'), true);
  });
}

for (const [name, mutate] of [
  ['out-of-wall offset', (items) => { items[0].offset = 999; }],
  ['negative offset', (items) => { items[0].offset = -1; }],
  ['non-finite width', (items) => { items[0].width = Infinity; }],
  ['too narrow opening', (items) => { items[0].width = 59; }],
  ['unknown wall', (items) => { items[0].wall = 'ceiling'; }],
  ['unknown opening kind', (items) => { items[0].kind = 'portal'; }],
  ['duplicate IDs', (items) => { items[1].id = items[0].id; }],
  ['overlap on the same wall', (items) => { items[1].wall = items[0].wall; items[1].offset = items[0].offset; }],
  ['too many openings', (items) => { while (items.length < 13) items.push({ ...items[0], id: `opening-extra-${items.length}` }); }],
]) test(`saved files reject ${name}`, () => {
  const project = defaultProject(); project.room.openings = getOpenings(project.room);
  mutate(project.room.openings);
  assert.equal(isProject(project), false); assert.ok(openingsProblem(project.room));
});

test('multiple windows and doors are kept in generated and exported layouts', () => {
  const project = defaultProject(); project.room.openings = [
    { id: 'opening-east', kind: 'window', wall: 'right', offset: 100, width: 150 },
    { id: 'opening-west', kind: 'window', wall: 'left', offset: 100, width: 100 },
    { id: 'opening-front', kind: 'door', wall: 'bottom', offset: 250, width: 85 },
    { id: 'opening-back', kind: 'door', wall: 'top', offset: 10, width: 85 },
  ];
  assert.equal(doorZones(project.room).length, 2);
  for (const layout of generateLayouts(project)) {
    assert.equal(layout.issueCount, 0);
    assert.deepEqual(layout.project.room.openings, project.room.openings);
    assert.equal(isProject(JSON.parse(JSON.stringify(layout.project))), true);
  }
});

test('near any window means the nearest; away means far from every window', () => {
  const source = plantProject(); source.furniture = [source.furniture[2]];
  source.room.openings = [
    { id: 'opening-east', kind: 'window', wall: 'right', offset: 100, width: 120 },
    { id: 'opening-west', kind: 'window', wall: 'left', offset: 100, width: 120 },
  ];
  source.furniture[0].x = 380; source.furniture[0].y = 120;
  assert.equal(requirementDistance(source, { itemId: 'plant-1', targetId: 'window', relation: 'near' }), 5);
  assert.equal(requirementDistance(source, { itemId: 'plant-1', targetId: 'opening-west', relation: 'near' }), 380);
  const plan = { ...plantPlan(), positions: [{ id: 'plant-1', x: 380, y: 120, rotated: false }] };
  assert.equal(checkAiPlan(plan, source).ok, true);
  plan.requirements[0].relation = 'away';
  assert.equal(checkAiPlan(plan, source).ok, false);
});

test('a room without windows does not accept a window requirement', () => {
  const source = plantProject(); source.room.openings = [];
  assert.equal(checkAiPlan(plantPlan(), source).ok, false);
});

test('review validation rejects invented targets, self references and malformed explanations', () => {
  const source = plantProject();
  for (const changes of [
    { requirements: [{ itemId: 'plant-1', targetId: 'opening-missing', relation: 'near' }] },
    { requirements: [{ itemId: 'plant-1', targetId: 'plant-1', relation: 'near' }] },
    { requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'maybe' }] },
    { unmetRequests: [''] }, { unmetRequests: ['x'.repeat(301)] },
  ]) assert.equal(isPreferenceReview({ ...review(), ...changes }, source), false);
});

test('confirmed conditions cannot be dropped, changed or invented by the layout model or repair', () => {
  const source = plantProject(), confirmed = review();
  for (const requirements of [[], [{ ...confirmed.requirements[0], relation: 'away' }], [...confirmed.requirements, { itemId: 'bed-1', targetId: 'left-wall', relation: 'near' }]]) {
    const plan = { ...plantPlan(), requirements };
    assert.equal(checkAiPlan(plan, source, 'Original note', confirmed).ok, false);
    assert.equal(repairAiPlan(plan, source, 'Original note', confirmed), null);
  }
});

test('the user can remove every condition without the original note restoring them', () => {
  const source = plantProject();
  const plan = { ...plantPlan(), requirements: [] };
  assert.equal(checkAiPlan(plan, source, 'Place the plant near the window.', { requirements: [], unmetRequests: [] }).ok, true);
});

test('unsupported requests from the review cannot silently disappear', () => {
  const confirmed = { ...review(), unmetRequests: ['Cannot verify sunlight.'] };
  assert.equal(checkAiPlan(plantPlan(), plantProject(), 'Original note', confirmed).ok, false);
  assert.equal(checkAiPlan({ ...plantPlan(), unmetRequests: confirmed.unmetRequests }, plantProject(), 'Original note', confirmed).ok, true);
});

test('interpretation asks for conditions only and never generates layout coordinates', async () => {
  let calls = 0;
  const output = await getPreferenceReview({ project: plantProject(), prompt: 'Plant near window' }, fakeConfig, async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.deepEqual(body.generationConfig.responseFormat.text.schema.required, ['requirements', 'unmetRequests']);
    assert.equal(body.generationConfig.responseFormat.text.schema.properties.positions, undefined);
    assert.match(body.systemInstruction.parts[0].text, /Do not generate furniture coordinates/);
    return result(review());
  });
  assert.equal(calls, 1); assert.deepEqual(output, review());
});

test('an invalid interpretation is rejected before it reaches the user', async () => {
  for (const bad of [{ requirements: [], unmetRequests: [] }, { requirements: [{ itemId: 'unknown', targetId: 'window', relation: 'near' }], unmetRequests: [] }]) {
    await assert.rejects(getPreferenceReview({ project: plantProject(), prompt: 'A note' }, fakeConfig, async () => result(bad)), (error) => error.code === 'GEMINI_RESPONSE_INVALID');
  }
});

test('layout requests carry confirmed conditions and actual opening geometry', async () => {
  const source = plantProject(); source.room.openings = getOpenings(source.room);
  const confirmed = review();
  const output = await getLayoutAdvice({ project: source, prompt: 'Original note', review: confirmed }, fakeConfig, async (_url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(input.confirmedPreferences, confirmed);
    assert.deepEqual(input.room.openings, source.room.openings);
    assert.equal(input.openingSegments.length, 2); assert.equal(input.doorClearance.length, 1);
    return result(plantPlan());
  });
  assert.deepEqual(output.requirements, confirmed.requirements);
});

test('the interpretation endpoint is local-only, versioned and validates requests', async (t) => {
  const { base } = await startApp(t, async () => result(review()));
  const url = `${base}/api/interpret-preferences`;
  assert.equal((await fetch(url)).status, 405);
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ project: plantProject(), prompt: 'A note' }, { Origin: 'https://example.com' })).status, 403);
  const response = await post({ project: plantProject(), prompt: 'Plant near window' });
  assert.equal(response.status, 200); assert.ok(response.headers.get('X-DormFit-AI-Version'));
  assert.deepEqual(await response.json(), review());
});
