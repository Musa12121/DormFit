import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../src/domain/model.ts';
import { analyze, clampItem, footprint, generateLayouts, outside } from '../src/domain/planner.ts';
import { isProject } from '../src/domain/storage.ts';
import { createProject, emptyProject, getFurnitureRequests } from '../src/domain/setup.ts';
import { axisPositions } from '../src/domain/positions.ts';
import { MAX_ROOM_CM } from '../src/domain/limits.ts';

test('demo plan has no furniture collisions, wall escapes, or blocked door', () => {
  const project = defaultProject();
  assert.deepEqual(analyze(project).issues, []);
  assert.ok(isProject(project));
});

test('large room search uses bounded samples and includes edges and alignment points', () => {
  const positions = axisPositions(9900, [37, 9893], 10);
  assert.ok(positions.length < 110);
  for (const position of [10, 37, 9893, 9900]) assert.ok(positions.includes(position));
  assert.deepEqual(axisPositions(-1), []);
  assert.deepEqual(axisPositions(Infinity), []);
});

test('100 metre layouts preserve all furniture and remain valid after JSON export and import', () => {
  const project = defaultProject();
  project.room = { ...project.room, width: MAX_ROOM_CM, depth: MAX_ROOM_CM };
  for (const layout of generateLayouts(project)) {
    assert.equal(layout.project.furniture.length, project.furniture.length);
    assert.deepEqual(analyze(layout.project).issues, []);
    assert.equal(isProject(JSON.parse(JSON.stringify(layout.project))), true);
  }
});

test('large rooms and furniture beyond the old coordinate limit can be saved', () => {
  const project = defaultProject();
  project.room = { ...project.room, width: 3500, depth: 6000 };
  project.furniture[0].x = 3000;
  project.furniture[0].y = 5000;
  assert.equal(isProject(project), true);
  project.room.width = MAX_ROOM_CM + 1;
  assert.equal(isProject(project), false);
});
test('rotation changes physical footprint and clamps it against room boundaries', () => {
  const project = defaultProject();
  const bed = { ...project.furniture[0], rotated: true, x: 390, y: 340 };
  assert.equal(footprint(bed).width, 200);
  const clamped = clampItem(bed, project.room);
  assert.equal(clamped.x, 220);
  assert.equal(clamped.y, 260);
  assert.equal(outside(clamped, project.room), false);
});
test('collisions and door blockage identify the affected furniture', () => {
  const project = defaultProject();
  project.furniture[1].x = 20;
  const collision = analyze(project).issues.find((i) => i.type === 'overlap');
  assert.ok(collision?.ids.includes('bed-a') && collision?.ids.includes('bed-b'));
  project.furniture[1].x = 200;
  project.furniture[1].y = 260;
  assert.ok(analyze(project).issues.some((i) => i.type === 'door' && i.ids.includes('bed-b')));
});
test('a rug under furniture is not treated as a collision or occupied floor', () => {
  const project = defaultProject();
  const without = analyze({
    ...project,
    furniture: project.furniture.filter((f) => f.kind !== 'rug'),
  });
  project.furniture.find((f) => f.kind === 'rug')!.x = 16;
  project.furniture.find((f) => f.kind === 'rug')!.y = 16;
  assert.equal(analyze(project).occupied, without.occupied);
  assert.equal(analyze(project).issues.length, 0);
});
test('overlapping furniture is not double counted as occupied space', () => {
  const project = defaultProject();
  const bed = project.furniture[0];
  project.furniture = [bed, { ...bed, id: 'duplicate' }];
  assert.equal(analyze(project).occupied, 2);
});
test('layout search returns three distinct, validated plans without mutating input', () => {
  const project = defaultProject();
  const snapshot = JSON.stringify(project);
  const layouts = generateLayouts(project);
  assert.equal(layouts.length, 3);
  assert.equal(new Set(layouts.map((l) => JSON.stringify(l.project.furniture))).size, 3);
  for (const layout of layouts) {
    assert.equal(layout.issueCount, 0, layout.name);
    assert.equal(analyze(layout.project).issues.length, 0);
    assert.equal(layout.project.furniture.length, project.furniture.length);
  }
  assert.equal(JSON.stringify(project), snapshot);
});
test('impossible furniture is preserved and reported rather than claimed as feasible', () => {
  const project = defaultProject();
  project.room = { width: 200, depth: 200, door: 85, window: 100 };
  const layouts = generateLayouts(project);
  assert.ok(layouts.every((l) => l.issueCount > 0));
  assert.ok(layouts.every((l) => l.project.furniture.length === project.furniture.length));
});
test('import validation rejects unsafe or unsupported shapes', () => {
  assert.equal(isProject({}), false);
  const project = defaultProject();
  assert.equal(isProject({ ...project, version: 99 }), false);
  project.room.width = NaN;
  assert.equal(isProject(project), false);
  const duplicate = defaultProject();
  duplicate.furniture[1].id = duplicate.furniture[0].id;
  assert.equal(isProject(duplicate), false);
  const negative = defaultProject();
  negative.furniture[0].depth = -5;
  assert.equal(isProject(negative), false);
  assert.equal(isProject({ ...defaultProject(), furniture: null }), false);
});

test('quantity input creates exactly the requested furniture with custom sizes', () => {
  const requests = getFurnitureRequests(emptyProject());
  requests.find((r) => r.kind === 'bed')!.count = 1;
  requests.find((r) => r.kind === 'bed')!.width = 90;
  requests.find((r) => r.kind === 'wardrobe')!.count = 3;
  const project = createProject({ ...emptyProject().room, height: 270 }, requests);
  assert.equal(project.furniture.length, 4);
  assert.equal(project.furniture.filter((f) => f.kind === 'bed').length, 1);
  assert.equal(project.furniture.filter((f) => f.kind === 'wardrobe').length, 3);
  assert.equal(project.furniture.find((f) => f.kind === 'bed')!.width, 90);
  assert.equal(new Set(project.furniture.map((f) => f.id)).size, 4);
  assert.equal(project.room.height, 270);
  assert.equal(isProject(project), true);
  assert.deepEqual(
    getFurnitureRequests(project).map((r) => r.count),
    requests.map((r) => r.count),
  );
});

test('layout generation keeps all requested furniture, including when the room is too small', () => {
  const requests = getFurnitureRequests(emptyProject());
  requests.find((r) => r.kind === 'bed')!.count = 5;
  const project = createProject({ width: 200, depth: 200, door: 85, window: 100 }, requests);
  const layouts = generateLayouts(project);
  assert.equal(layouts.length, 3);
  for (const layout of layouts) {
    assert.equal(layout.project.furniture.length, 5);
    assert.ok(layout.issueCount > 0);
  }
});

test('optional height and older roommate files are validated without requiring either field', () => {
  const project = defaultProject();
  assert.equal(isProject(project), true);
  assert.equal(isProject({ ...project, room: { ...project.room, height: 270 } }), true);
  assert.equal(isProject({ ...project, room: { ...project.room, height: -1 } }), false);
  assert.equal(isProject({ ...project, room: { ...project.room, height: null } }), false);
  assert.equal(
    isProject({
      ...project,
      roommates: [
        { name: 'A', daylight: true, privacy: false },
        { name: 'B', daylight: false, privacy: true },
      ],
    }),
    true,
  );
});

test('quantity form limits reject empty, fractional and excessive counts', () => {
  const requests = getFurnitureRequests(emptyProject());
  assert.throws(() => createProject(emptyProject().room, requests));
  requests[0].count = 1.5;
  assert.throws(() => createProject(emptyProject().room, requests));
  for (const request of requests) request.count = 10;
  assert.throws(() => createProject(emptyProject().room, requests));
});

test('sizes of furniture with zero quantity do not block the selected furniture', () => {
  const requests = getFurnitureRequests(emptyProject());
  requests[0].width = 0;
  requests.find((request) => request.kind === 'wardrobe')!.count = 1;
  assert.equal(createProject(emptyProject().room, requests).furniture.length, 1);
});

test('an oversized rug still reports its room boundary violation', () => {
  const project = emptyProject();
  project.furniture = [
    {
      id: 'rug',
      name: 'Large rug',
      kind: 'rug',
      owner: 'shared',
      width: 400,
      depth: 400,
      x: 0,
      y: 0,
      rotated: false,
    },
  ];
  assert.ok(analyze(project).issues.some((issue) => issue.type === 'outside'));
});
