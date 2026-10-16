import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, retiredCatalog } from '../../src/domain/model.ts';
import { createProject, emptyProject, getFurnitureRequests } from '../../src/domain/setup.ts';
import { generateLayouts } from '../../src/domain/planner.ts';
import { isProject } from '../../src/domain/storage.ts';
import { checkAiPlan } from '../../src/domain/ai.ts';

for (const entry of catalog) {
  test(`${entry.name} supports quantities, saved files, local layouts and checked AI positions`, () => {
    const room = { ...emptyProject().room, width: 1000, depth: 900 };
    const source = createProject(room, [{ ...entry, count: 2 }]);
    assert.equal(source.furniture.length, 2);
    assert.ok(isProject(JSON.parse(JSON.stringify(source))));
    assert.equal(getFurnitureRequests(source).find(request => request.kind === entry.kind).count, 2);
    for (const layout of generateLayouts(source)) {
      assert.equal(layout.issueCount, 0);
      assert.equal(layout.project.furniture.length, 2);
      assert.ok(isProject(layout.project));
      const plan = { positions: layout.project.furniture.map(({ id, x, y, rotated }) => ({ id, x, y, rotated })),
        requirements: [], unmetRequests: [], explanation: 'Placed both items in the room.', tips: [] };
      assert.equal(checkAiPlan(plan, source).ok, true);
    }
  });
}

test('a mixed room keeps all 24 types and their custom sizes after generation and JSON import', () => {
  assert.equal(new Set(catalog.map(entry => entry.kind)).size, 24);
  const source = createProject({ ...emptyProject().room, width: 2000, depth: 1500 }, catalog.map(entry => ({
    ...entry, count: 1, width: entry.width + 5, depth: entry.depth + 5,
  })));
  for (const layout of generateLayouts(source)) {
    assert.equal(layout.issueCount, 0);
    assert.ok(isProject(JSON.parse(JSON.stringify(layout.project))));
    assert.deepEqual(layout.project.furniture.map(({ kind, width, depth }) => ({ kind, width, depth })),
      source.furniture.map(({ kind, width, depth }) => ({ kind, width, depth })));
  }
});

test('older saved furniture remains readable and is preserved when quantities are edited', () => {
  const oldRoom = createProject({ ...emptyProject().room, width: 1200, depth: 1000 }, retiredCatalog.map(entry => ({ ...entry, count: 1 })));
  assert.ok(isProject(JSON.parse(JSON.stringify(oldRoom))));
  const requests = getFurnitureRequests(oldRoom);
  for (const entry of retiredCatalog) assert.equal(requests.find(request => request.kind === entry.kind).count, 1);
  const rebuilt = createProject(oldRoom.room, requests);
  assert.deepEqual(rebuilt.furniture.map(item => item.kind), oldRoom.furniture.map(item => item.kind));
  assert.equal(getFurnitureRequests(emptyProject()).length, catalog.length);
});
