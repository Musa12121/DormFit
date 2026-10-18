import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../src/domain/model.ts';
import { createProject } from '../../src/domain/setup.ts';
import { analyze, generateLayouts, similarLayouts } from '../../src/domain/planner.ts';
import { requirementDistance } from '../../src/domain/ai.ts';
import { canWatchFromSofa, facesTable } from '../../src/domain/usability.ts';
import { furnitureGap, TV_DINING_CLEARANCE } from '../../src/domain/spacing.ts';

test('distinct dining arrangements retain usable seating without crowding the TV', () => {
  const counts = { sofa: 2, chair: 6, rug: 1, 'dining-table': 1, 'tv-stand': 1 };
  const source = createProject({ width: 400, depth: 500, door: 85, window: 155 },
    catalog.filter(item => counts[item.kind]).map(item => ({ ...item, count: counts[item.kind] })));
  const snapshot = structuredClone(source);
  const options = generateLayouts(source);
  assert.equal(options.length, 3);
  for (const [index, option] of options.entries()) {
    const project = option.project;
    assert.deepEqual(analyze(project).issues, []);
    const chairs = project.furniture.filter(item => item.kind === 'chair');
    // The TV's new 60 cm separation takes precedence over the former
    // five-chair target. Account for every omitted chair instead of crowding it.
    assert.ok(chairs.length >= 3, 'Keep a usable dining group in each distinct seating pattern');
    assert.equal(chairs.length + (project.omittedChairs?.length ?? 0), 6);
    const table = project.furniture.find(item => item.kind === 'dining-table');
    assert.ok(chairs.every(chair => facesTable(chair, table)));
    const tv = project.furniture.find(item => item.kind === 'tv-stand');
    assert.ok([table, ...chairs].every(item => furnitureGap(item, tv) >= TV_DINING_CLEARANCE - .001));
    assert.ok(project.furniture.filter(item => item.kind === 'sofa').every(sofa => canWatchFromSofa(sofa, tv, project.furniture)));
    for (const other of options.slice(0, index)) assert.equal(similarLayouts(project, other.project), false);
  }
  const seatingPatterns = options.map(option => {
    const sofas = option.project.furniture.filter(item => item.kind === 'sofa');
    const tv = option.project.furniture.find(item => item.kind === 'tv-stand');
    return `${tv.rotation}:${Math.abs(sofas[0].x - sofas[1].x) >= 60 ? 'staggered' : 'aligned'}`;
  });
  assert.equal(new Set(seatingPatterns).size, 3, 'Changing only the dining table must not count as a third room concept');
  const distance = option => requirementDistance(option.project, { itemId: 'dining-table-1', targetId: 'window', relation: 'near' });
  const daylight = options.find(option => option.id === 'daylight');
  assert.equal(daylight.name, 'Daylight dining area');
  assert.ok(distance(daylight) <= distance(options.find(option => option.id === 'balanced')));
  assert.ok(options.some(option => option.project.furniture.filter(item => item.kind === 'chair').length >= 4));
  assert.deepEqual(source, snapshot);
});
