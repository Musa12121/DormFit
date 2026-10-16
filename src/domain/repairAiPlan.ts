import type { Furniture, Project } from './model.ts';
import { footprint, outside, overlaps } from './planner.ts';
import { doorZones, getOpenings, openingSegment } from './openings.ts';
import { checkAiPlan, isRoomTarget, readAiPlan, requirementSatisfied } from './ai.ts';
import type { AiPlan, PreferenceReview } from './ai.ts';
import { axisPositions } from './positions.ts';

// AI chooses the relationships and proposed positions. This bounded search moves pieces
// to nearby valid positions without deleting furniture or relaxing any declared rule.
export function repairAiPlan(value: unknown, source: Project, prompt = '', review?: PreferenceReview): AiPlan | null {
  const parsed = readAiPlan(value, source, prompt, review);
  if (!parsed.ok) return null;
  const plan = parsed.plan;
  const original = checkAiPlan(plan, source, prompt, review);
  if (original.ok) return original.plan;
  const deadline = Date.now() + 1500;
  const doors = doorZones(source.room);
  const segments = getOpenings(source.room).map((opening) => openingSegment(source.room, opening));

  const choices: { item: Furniture; positions: Furniture[]; fixedRules: number }[] = [];
  for (const item of source.furniture) {
    const preferred = plan.positions.find((position) => position.id === item.id)!;
    const fixedRules = plan.requirements.filter((rule) => rule.itemId === item.id && isRoomTarget(rule.targetId));
    const positions: { item: Furniture; cost: number }[] = [];
    for (const rotated of [preferred.rotated, !preferred.rotated]) {
      const width = rotated ? item.depth : item.width;
      const depth = rotated ? item.width : item.depth;
      const offsets = [-60, -40, -20, -10, 0, 10, 20, 40, 60];
      const xs = axisPositions(source.room.width - width, [
        ...offsets.map((offset) => preferred.x + offset),
        ...segments.flatMap((segment) => [segment.x - width, segment.x, segment.x + segment.width]),
      ]);
      const ys = axisPositions(source.room.depth - depth, [
        ...offsets.map((offset) => preferred.y + offset),
        ...segments.flatMap((segment) => [segment.y - depth, segment.y, segment.y + segment.depth]),
      ]);
      for (const x of xs) {
        if (Date.now() > deadline) return null;
        for (const y of ys) {
          const candidate = { ...item, x, y, rotated };
          if (outside(candidate, source.room)) continue;
          if (item.kind !== 'rug' && doors.some((door) => overlaps(footprint(candidate), door))) continue;
          const partial = { ...source, furniture: [candidate] };
          if (!fixedRules.every((rule) => requirementSatisfied(partial, rule))) continue;
          positions.push({
            item: candidate,
            cost: Math.hypot(x - preferred.x, y - preferred.y) + (rotated === preferred.rotated ? 0 : 20),
          });
        }
      }
    }
    if (Date.now() > deadline || positions.length === 0) return null;
    positions.sort((a, b) => a.cost - b.cost);
    choices.push({ item, positions: positions.map((position) => position.item), fixedRules: fixedRules.length });
  }
  // Reserve constrained positions first; place larger remaining pieces before smaller ones.
  choices.sort((a, b) => b.fixedRules - a.fixedRules ||
    Number(a.item.kind === 'rug') - Number(b.item.kind === 'rug') ||
    b.item.width * b.item.depth - a.item.width * a.item.depth);

  const placed: Furniture[] = [];
  let visited = 0;
  function search(index: number): boolean {
    if (++visited > 4000 || Date.now() > deadline) return false;
    if (index === choices.length) return true;
    let tried = 0;
    for (const candidate of choices[index].positions) {
      if (candidate.kind !== 'rug' && placed.some((other) => other.kind !== 'rug' &&
        overlaps(footprint(candidate), footprint(other)))) continue;
      const partial = { ...source, furniture: [...placed, candidate] };
      const knownIds = new Set(partial.furniture.map((item) => item.id));
      const knownRules = plan.requirements.filter((rule) => knownIds.has(rule.itemId) &&
        (isRoomTarget(rule.targetId) || knownIds.has(rule.targetId)));
      if (!knownRules.every((rule) => requirementSatisfied(partial, rule))) continue;
      if (++tried > 80) break;
      placed.push(candidate);
      if (search(index + 1)) return true;
      placed.pop();
    }
    return false;
  }
  if (!search(0)) return null;

  const repaired: AiPlan = {
    ...plan,
    positions: placed.map(({ id, x, y, rotated }) => ({ id, x, y, rotated })),
    explanation: 'Furniture positions were adjusted to fit the room while preserving the placement conditions understood by AI.',
    adjusted: true,
  };
  const checked = checkAiPlan(repaired, source, prompt, review);
  return checked.ok ? checked.plan : null;
}
