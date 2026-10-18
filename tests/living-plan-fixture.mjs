// A measured response fixture: five dining chairs fit alongside both sofas.
// Keep coordinates explicit so endpoint tests cannot substitute generateLayouts().
export function livingPlan(project) {
  const positions = [
    ['rug-1', 170, 200, 270], ['sofa-1', 10, 65, 270], ['sofa-2', 10, 295, 270],
    ['chair-1', 207.5, 120, 0], ['chair-2', 315, 180, 90], ['chair-3', 237.5, 335, 180],
    ['chair-4', 160, 200, 270], ['chair-5', 160, 275, 270],
    ['dining-table-1', 220, 180, 90], ['tv-stand-1', 360, 335, 90],
  ].map(([id, x, y, rotation]) => ({ id, x, y, rotation }));
  const ids = new Set(positions.map(position => position.id));
  return { positions, omittedChairIds: project.furniture.filter(item => !ids.has(item.id)).map(item => item.id),
    requirements: [], unmetRequests: [], explanation: 'Seating faces the TV with a separate dining area.', tips: [] };
}
