import { emptyProject } from '../../src/domain/setup';
import type { Furniture, Project } from '../../src/domain/model';
import type { AiPlan } from '../../src/domain/ai';

export function furniture(patch: Partial<Furniture> = {}): Furniture {
  return {
    id: 'bed-1', kind: 'bed', name: 'Bed 1', owner: 'a',
    width: 100, depth: 200, x: 10, y: 100, rotated: false,
    ...patch,
  };
}

export function project(): Project {
  return { ...emptyProject(), furniture: [
    furniture(),
    furniture({ id: 'plant-1', kind: 'plant', name: 'Plant 1', width: 35, depth: 35, x: 190, y: 10, owner: 'shared' }),
  ] };
}

export function aiPlan(): AiPlan {
  return {
    positions: project().furniture.map(({ id, x, y, rotated }) => ({ id, x, y, rotated })),
    requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'near' }],
    unmetRequests: [], explanation: 'The plant is placed near the window.', tips: ['Check the measurements.'],
  };
}
