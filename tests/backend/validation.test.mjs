import test from 'node:test';
import assert from 'node:assert/strict';
import { isProject } from '../../src/domain/storage.ts';
import { plantProject, plantPlan } from '../ai-fixtures.mjs';
import { checkAiPlan, requirementDistance } from '../../src/domain/ai.ts';
import { repairAiPlan } from '../../src/domain/repairAiPlan.ts';
import { analyze } from '../../src/domain/planner.ts';

for (const [name, mutate] of [
  ['blank project name', (p) => { p.name = ' '; }],
  ['overlong project name', (p) => { p.name = 'a'.repeat(81); }],
  ['unsupported version', (p) => { p.version = 2; }],
  ['too small room', (p) => { p.room.width = 199; }],
  ['too large room', (p) => { p.room.depth = 10_001; }],
  ['non-finite room size', (p) => { p.room.width = Infinity; }],
  ['height below minimum', (p) => { p.room.height = 179; }],
  ['height above maximum', (p) => { p.room.height = 601; }],
  ['door below minimum', (p) => { p.room.door = 59; }],
  ['window beyond wall', (p) => { p.room.window = p.room.width; }],
  ['unknown furniture kind', (p) => { p.furniture[0].kind = 'unknown-furniture'; }],
  ['unknown furniture owner', (p) => { p.furniture[0].owner = 'anyone'; }],
  ['duplicate furniture IDs', (p) => { p.furniture[1].id = p.furniture[0].id; }],
  ['missing furniture ID', (p) => { delete p.furniture[0].id; }],
  ['non-boolean rotation', (p) => { p.furniture[0].rotated = 'true'; }],
  ['negative furniture size', (p) => { p.furniture[0].width = -1; }],
  ['numeric string furniture size', (p) => { p.furniture[0].depth = '55'; }],
  ['non-finite furniture position', (p) => { p.furniture[0].x = NaN; }],
  ['more than thirty pieces', (p) => { p.furniture = Array.from({ length: 31 }, (_, i) => ({ ...p.furniture[0], id: `piece-${i}` })); }],
  ['malformed legacy roommates', (p) => { p.roommates = [{ name: 'A' }]; }],
]) {
  test(`project boundary rejects ${name}`, () => {
    const project = plantProject(); mutate(project); assert.equal(isProject(project), false);
  });
}

for (const [width, depth] of [[300, 300], [420, 360], [500, 400], [600, 500]]) {
  test(`repairs a crowded AI proposal in a ${width} × ${depth} room while preserving the note`, () => {
    const source = plantProject(); source.room = { width, depth, door: 85, window: 155 };
    source.furniture.push({ id: 'wardrobe-1', name: 'Wardrobe 1', kind: 'wardrobe', owner: 'shared', width: 80, depth: 55, x: 10, y: 10, rotated: false });
    const proposal = plantPlan(); proposal.positions = source.furniture.map(({ id }) => ({ id, x: 10, y: 10, rotated: false }));
    proposal.requirements = [
      { itemId: 'plant-1', targetId: 'window', relation: 'near' },
      { itemId: 'bed-1', targetId: 'door', relation: 'away' },
      { itemId: 'desk-1', targetId: 'right-wall', relation: 'near' },
    ];
    const repaired = repairAiPlan(proposal, source, 'Place the plant near the window.');
    assert.ok(repaired, 'Expected a feasible repaired layout');
    const result = checkAiPlan(repaired, source, 'Place the plant near the window.'); assert.equal(result.ok, true);
    assert.deepEqual(analyze(result.layout.project).issues, []);
    assert.deepEqual(repaired.requirements, proposal.requirements);
    assert.equal(result.layout.project.furniture.length, 4);
  });
}

test('near-window distance uses the window segment rather than the whole wall', () => {
  const source = plantProject(); const rule = { itemId: 'plant-1', targetId: 'window', relation: 'near' };
  source.furniture.find((item) => item.id === 'plant-1').x = 0;
  source.furniture.find((item) => item.id === 'plant-1').y = 0;
  assert.ok(requirementDistance(source, rule) > 60);
});

test('a near-furniture requirement remains enforced after coordinate repair', () => {
  const source = plantProject(); const proposal = plantPlan();
  proposal.positions[2].x = 330; proposal.positions[2].y = 300;
  proposal.requirements = [{ itemId: 'plant-1', targetId: 'bed-1', relation: 'near' }];
  const repaired = repairAiPlan(proposal, source, 'Place the plant near the bed.'); assert.ok(repaired);
  const checked = checkAiPlan(repaired, source, 'Place the plant near the bed.'); assert.equal(checked.ok, true);
  assert.ok(requirementDistance(checked.layout.project, proposal.requirements[0]) <= 60);
});

test('an oversized wardrobe cannot be made valid by dropping or shrinking it', () => {
  const source = plantProject(); source.room.width = 200; source.room.depth = 200;
  source.furniture = [{ ...source.furniture[0], kind: 'wardrobe', width: 400, depth: 400 }];
  const proposal = plantPlan(); proposal.positions = [{ id: 'bed-1', x: 0, y: 0, rotated: false }];
  proposal.requirements = []; proposal.unmetRequests = ['The wardrobe does not fit in the room.'];
  assert.equal(repairAiPlan(proposal, source, 'Place the wardrobe.'), null);
  assert.equal(source.furniture[0].width, 400);
});
