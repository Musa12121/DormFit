import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../../src/domain/model.ts';
import { analyze, generateLayouts } from '../../src/domain/planner.ts';
import { checkAiPlan, requirementSatisfied } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { furnitureGap } from '../../src/domain/spacing.ts';
import { planValidationError } from '../../server/geminiErrors.mjs';
import { planInstructions } from '../../server/planPrompt.mjs';

const item = (id, x, y, patch = {}) => ({
  id, name: id, kind: 'desk', owner: 'shared', width: 100, depth: 60,
  x, y, rotated: false, ...patch,
});
const project = furniture => ({ ...defaultProject(),
  room: { width: 500, depth: 400, door: 85, window: 100, openings: [] }, furniture,
});
const plan = source => ({
  positions: source.furniture.map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotated, rotation })),
  explanation: 'Proposed furniture positions.', tips: [], requirements: [], unmetRequests: [],
});

for (const gap of [0, 1, 10, 29.9]) {
  test(`non-overlapping furniture with a ${gap} cm gap is rejected by analysis and AI validation`, () => {
    const source = project([item('a', 30, 100), item('b', 130 + gap, 100)]);
    const issues = analyze(source).issues;
    assert.deepEqual(issues.map(issue => issue.type), ['spacing']);
    assert.deepEqual(issues[0].ids, ['a', 'b']);
    const checked = checkAiPlan(plan(source), source);
    assert.equal(checked.ok, false);
    assert.ok(checked.problems.some(problem => problem.startsWith('spacing:')));
  });
}

test('30 cm boundaries use rotated footprint edges and diagonal corner distance', () => {
  const rotated = project([item('a', 30, 100, { rotated: true, rotation: 90 }), item('b', 120, 100)]);
  assert.equal(furnitureGap(...rotated.furniture), 30);
  assert.deepEqual(analyze(rotated).issues, []);
  rotated.furniture[1].x = 119;
  assert.equal(analyze(rotated).issues[0].type, 'spacing');
  const diagonal = project([item('a', 30, 100), item('b', 148, 184)]);
  assert.equal(furnitureGap(...diagonal.furniture), 30);
  assert.deepEqual(analyze(diagonal).issues, []);
  diagonal.furniture[1].y--;
  assert.equal(analyze(diagonal).issues[0].type, 'spacing');
});

test('rugs can touch and sit underneath furniture without a spacing warning', () => {
  const source = project([item('a', 30, 100), item('rug', 30, 100, { kind: 'rug' })]);
  assert.deepEqual(analyze(source).issues, []);
  assert.equal(checkAiPlan(plan(source), source).ok, true);
});

test('every algorithm layout prefers 60 cm gaps when space permits, including without doors', () => {
  const source = project([item('a', 10, 10), item('b', 110, 10),
    item('plant', 210, 10, { kind: 'plant', width: 35, depth: 35 })]);
  const snapshot = structuredClone(source);
  for (const layout of generateLayouts(source)) {
    assert.equal(layout.issueCount, 0);
    for (let i = 0; i < layout.project.furniture.length; i++) {
      for (const other of layout.project.furniture.slice(i + 1)) {
        assert.ok(furnitureGap(layout.project.furniture[i], other) >= 60);
      }
    }
  }
  assert.deepEqual(source, snapshot);
});

test('AI repair separates touching pieces while preserving a confirmed near relationship', () => {
  const source = project([item('a', 30, 100), item('b', 130, 100)]);
  const proposal = plan(source);
  proposal.requirements = [{ itemId: 'a', targetId: 'b', relation: 'near' }];
  const review = { requirements: proposal.requirements, unmetRequests: [] };
  const snapshot = structuredClone(source);
  const repaired = repairAiPlan(proposal, source, 'Keep these pieces near each other.', review);
  assert.ok(repaired?.adjusted);
  const checked = checkAiPlan(repaired, source, '', review);
  assert.equal(checked.ok, true);
  assert.ok(furnitureGap(...checked.layout.project.furniture) >= 30);
  assert.equal(requirementSatisfied(checked.layout.project, proposal.requirements[0]), true);
  assert.deepEqual(repaired.requirements, review.requirements);
  assert.deepEqual(source, snapshot);
});

test('a room that only fits touching furniture is reported as crowded without deleting pieces', () => {
  const source = project([item('a', 0, 0, { depth: 100 }), item('b', 100, 0, { depth: 100 })]);
  source.room.width = 220; source.room.depth = 100;
  for (const layout of generateLayouts(source)) {
    assert.ok(layout.issueCount > 0);
    assert.equal(layout.project.furniture.length, 2);
  }
  assert.equal(repairAiPlan(plan(source), source), null);
});

test('AI instructions and validation diagnostics describe spacing explicitly', () => {
  assert.match(planInstructions, /at least 30 cm/);
  assert.match(planInstructions, /Prefer 60 cm/);
  const error = planValidationError(['spacing: a, b']);
  assert.deepEqual(error.checks, ['spacing']);
  assert.match(error.message, /furniture spacing/);
});
