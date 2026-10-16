import { defaultProject } from '../src/domain/model.ts';

// Small measured room: one bed, one desk and one plant. No config or real key is loaded.
export function plantProject() {
  const project = defaultProject();
  project.furniture = project.furniture.filter((item) => ['bed-a', 'desk-a'].includes(item.id));
  project.furniture = project.furniture.map((item) => ({ ...item, id: `${item.kind}-1` }));
  project.furniture.push({
    id: 'plant-1', kind: 'plant', name: 'Plant 1', owner: 'shared',
    width: 35, depth: 35, x: 330, y: 300, rotated: false,
  });
  return project;
}

export function plantPlan() {
  return {
    positions: [
      { id: 'bed-1', x: 10, y: 100, rotated: false },
      { id: 'desk-1', x: 280, y: 10, rotated: false },
      { id: 'plant-1', x: 190, y: 10, rotated: false },
    ],
    requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'near' }],
    unmetRequests: [],
    explanation: 'The plant is near the window without overlapping the bed or desk.',
    tips: ['Check the actual furniture measurements.'],
  };
}
