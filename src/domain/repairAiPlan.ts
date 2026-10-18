import type { Furniture, Project } from './model.ts';
import { isBed, isWallMounted, occupiesFloor } from './model.ts';
import { footprint, outside, overlaps } from './planner.ts';
import { furnitureEntranceZones, getOpenings, openingSegment } from './openings.ts';
import { orientation, rotationOf } from './rotation.ts';
import { inaccessibleFurniture } from './access.ts';
import type { Rotation } from './model.ts';
import { checkAiPlan, isRoomTarget, readAiPlan, requirementSatisfied } from './ai.ts';
import type { AiPlan, PreferenceReview } from './ai.ts';
import { axisPositions } from './positions.ts';
import { MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP, placementConflict } from './spacing.ts';
import { diningChairGroups, diningSeatingPenalty, diningTableAnchors } from './dining.ts';
import { wallTvPositions } from './mounting.ts';
import { alignSeatingRugs, findLoungeGroup, isTelevision, loungeGroups } from './lounge.ts';
import { bedsidePositions, chairPositions, functionalPlacementAllowed, isChair, isSofa, requiresFourSeatDining, usabilityIssues, workspaceDepth } from './usability.ts';

// Repair the model's proposal, never substitute a generated regular layout.
// Try the full request first, then leave out the fewest unprotected chairs.
// Never discard other furniture or silently remove a confirmed placement condition.
export function repairAiPlan(value: unknown, source: Project, prompt = '', review?: PreferenceReview): AiPlan | null {
  const parsed = readAiPlan(value, source, prompt, review);
  if (!parsed.ok) return null;
  const finish = (candidate: AiPlan) => {
    const checked = checkAiPlan(candidate, source, prompt, review);
    if (!checked.ok) return null;
    const protectedIds = new Set(candidate.requirements.flatMap(rule => [rule.itemId, rule.targetId]));
    const aligned = alignSeatingRugs(checked.layout.project, protectedIds);
    const positions = aligned.furniture.map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotated, rotation }));
    const changed = positions.some(position => {
      const previous = candidate.positions.find(other => other.id === position.id)!;
      return position.x !== previous.x || position.y !== previous.y || rotationOf(position) !== rotationOf(previous);
    });
    if (!changed) return checked.plan;
    const final = checkAiPlan({ ...candidate, positions, adjusted: true }, source, prompt, review);
    return final.ok ? final.plan : checked.plan;
  };
  let plan = parsed.plan;
  if (plan.omittedChairIds?.length) {
    const ids = new Set(plan.omittedChairIds);
    plan = { ...plan, omittedChairIds: undefined, positions: [...plan.positions,
      ...source.furniture.filter(item => ids.has(item.id)).map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotated, rotation }))] };
  }
  const checked = checkAiPlan(plan, source, prompt, review);
  if (checked.ok) return finish(checked.plan);
  const removable = source.furniture.filter(item => isChair(item)
    && !(item.kind === 'chair' && requiresFourSeatDining(source.furniture))
    && !plan.requirements.some(rule => rule.itemId === item.id || rule.targetId === item.id)).reverse();
  const deadline = Date.now() + 6000;
  for (let count = 0; count <= removable.length; count++) {
    const omitted = new Set(removable.slice(0, count).map(item => item.id));
    const reduced = { ...source, furniture: source.furniture.filter(item => !omitted.has(item.id)) };
    const { omittedChairIds: _omitted, ...proposal } = plan;
    const candidate = { ...proposal, positions: plan.positions.filter(position => !omitted.has(position.id)) };
    const budget = Math.min(count === 0 ? 3000 : 1200, deadline - Date.now());
    if (budget <= 0) break;
    const repaired = repairAllFurniture(candidate, reduced, prompt, review, budget);
    if (!repaired) continue;
    const result = { ...repaired, ...(omitted.size ? { omittedChairIds: [...omitted] } : {}) };
    const validated = checkAiPlan(result, source, prompt, review);
    if (validated.ok) return finish(validated.plan);
  }
  return null;
}

function repairAllFurniture(value: unknown, source: Project, prompt: string, review: PreferenceReview | undefined, budget: number): AiPlan | null {
  const parsed = readAiPlan(value, source, prompt, review);
  if (!parsed.ok) return null;
  const plan = parsed.plan;
  const proposedItems = source.furniture.map(item => {
    const position = plan.positions.find(position => position.id === item.id)!;
    return { ...item, ...position, ...orientation(rotationOf(position)) };
  });
  const displacement = (item: Furniture) => {
    const proposed = proposedItems.find(other => other.id === item.id)!;
    return Math.hypot(item.x - proposed.x, item.y - proposed.y) + (rotationOf(item) === rotationOf(proposed) ? 0 : 20);
  };
  const groupScore = (items: Furniture[]) => items.reduce((sum, item) => sum + displacement(item), 0);
  const original = checkAiPlan(plan, source, prompt, review);
  if (original.ok) return original.plan;
  const deadline = Date.now() + budget;
  const diningTables = source.furniture.filter(item => item.kind === 'dining-table');
  const diningChairs = source.furniture.filter(item => item.kind === 'chair');
  if (diningTables.length === 1 && diningChairs.length && !source.furniture.some(item => item.kind === 'desk' || item.kind === 'vanity')
    && diningChairs.every(item => item.width === diningChairs[0].width && item.depth === diningChairs[0].depth)
    && !diningChairGroups(diningTables[0], diningChairs).length) return null;
  const workDepth = workspaceDepth(source.furniture);
  const segments = getOpenings(source.room).map((opening) => openingSegment(source.room, opening));
  const dependencies = (item: Furniture) => source.furniture.filter(other =>
    ((item.kind === 'nightstand' || isWallMounted(item) || item.kind === 'tv-stand') && isBed(other.kind))
    || (isChair(item) && (other.kind === 'desk' || other.kind === 'vanity'
      || (item.kind === 'chair' && other.kind === 'dining-table')))
    || (isSofa(item) && isTelevision(other)));

  const choices: { item: Furniture; positions: Furniture[]; fixedRules: number }[] = [];
  for (const item of source.furniture) {
    const preferred = plan.positions.find((position) => position.id === item.id)!;
    const fixedRules = plan.requirements.filter((rule) => rule.itemId === item.id && isRoomTarget(rule.targetId));
    if (isWallMounted(item)) {
      const positions = wallTvPositions({ ...item, ...preferred }, source.room)
        .filter(candidate => fixedRules.every(rule => requirementSatisfied({ ...source, furniture: [candidate] }, rule)));
      if (!positions.length) return null;
      choices.push({ item, positions, fixedRules: fixedRules.length });
      continue;
    }
    // These positions depend on the actual repaired bed/table, not the model's
    // invalid coordinates. Generate them when their targets have been placed.
    if ((item.kind === 'office-chair' || item.kind === 'nightstand'
      || (item.kind === 'chair' && source.furniture.some(other => other.kind === 'dining-table')))
      && dependencies(item).length) {
      choices.push({ item, positions: [], fixedRules: fixedRules.length });
      continue;
    }
    const positions: { item: Furniture; cost: number }[] = [];
    const start = rotationOf(preferred);
    const neighbours = source.furniture.filter((other) => other.id !== item.id && occupiesFloor(other))
      .map((other) => footprint({ ...other, ...plan.positions.find((position) => position.id === other.id)! }));
    for (const rotation of [start, (start + 90) % 360, (start + 180) % 360, (start + 270) % 360] as Rotation[]) {
      const sideways = rotation % 180 === 90;
      const width = sideways ? item.depth : item.width;
      const depth = sideways ? item.width : item.depth;
      // Supply measurement-derived candidate anchors without replacing the
      // proposed arrangement. Prefer orientations with space for both zones.
      const anchors = item.kind === 'dining-table' ? diningTableAnchors(source.room, source.furniture, width, depth) : [];
      const otherAnchors = item.kind === 'dining-table' ? diningTableAnchors(source.room, source.furniture, depth, width) : [];
      const orientationCost = !anchors.length && otherAnchors.length ? 1000 : 0;
      const offsets = [-60, -40, -MIN_FURNITURE_GAP, -20, -10, 0, 10, 20, MIN_FURNITURE_GAP, 40, 60];
      const xs = axisPositions(source.room.width - width, [
        ...anchors.map(anchor => anchor.x),
        ...offsets.map((offset) => preferred.x + offset),
        ...neighbours.flatMap((rect) => [MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP]
          .flatMap((gap) => [rect.x - width - gap, rect.x + rect.width + gap])),
        ...segments.flatMap((segment) => [segment.x - width, segment.x, segment.x + segment.width]),
      ]);
      const ys = axisPositions(source.room.depth - depth, [
        ...anchors.map(anchor => anchor.y),
        ...offsets.map((offset) => preferred.y + offset),
        ...neighbours.flatMap((rect) => [MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP]
          .flatMap((gap) => [rect.y - depth - gap, rect.y + rect.depth + gap])),
        ...segments.flatMap((segment) => [segment.y - depth, segment.y, segment.y + segment.depth]),
      ]);
      for (const x of xs) {
        if (Date.now() > deadline) return null;
        for (const y of ys) {
          const candidate = { ...item, x, y, ...orientation(rotation) };
          if (outside(candidate, source.room)) continue;
          if (!functionalPlacementAllowed(candidate, source.room, [], workDepth)) continue;
          if (occupiesFloor(item) && furnitureEntranceZones(source.room, candidate).some((door) => overlaps(footprint(candidate), door))) continue;
          const partial = { ...source, furniture: [candidate] };
          if (!fixedRules.every((rule) => requirementSatisfied(partial, rule))) continue;
          positions.push({
            item: candidate,
            cost: Math.hypot(x - preferred.x, y - preferred.y) + (rotation === start ? 0 : 20) + orientationCost,
          });
        }
      }
    }
    if (Date.now() > deadline || positions.length === 0) return null;
    positions.sort((a, b) => a.cost - b.cost);
    choices.push({ item, positions: positions.map((position) => position.item), fixedRules: fixedRules.length });
  }
  // Reserve constrained positions first; place larger remaining pieces before smaller ones.
  const order = (item: Furniture) => item.kind === 'dining-table' && source.furniture.some(other => other.kind === 'chair') ? -1
    : isSofa(item) && source.furniture.some(isTelevision) ? 5 : isWallMounted(item) ? 4 : isChair(item) ? 3
    : item.kind === 'nightstand' ? 2 : item.kind === 'tv-stand' ? 1 : 0;
  choices.sort((a, b) => order(a.item) - order(b.item) || b.fixedRules - a.fixedRules ||
    Number(a.item.kind === 'rug') - Number(b.item.kind === 'rug') ||
    b.item.width * b.item.depth - a.item.width * a.item.depth);

  const placed: Furniture[] = [];
  let visited = 0;
  function search(remaining: typeof choices): boolean {
    if (++visited > 4000 || Date.now() > deadline) return false;
    if (!remaining.length) return inaccessibleFurniture({ ...source, furniture: placed }).length === 0;
    let tried = 0;
    // Reserve companions before unrelated pieces consume their only usable
    // positions. A TV placed now also protects its viewing line from later items.
    const ready = remaining.find(choice => {
      const targets = dependencies(choice.item);
      return targets.length && targets.every(target => placed.some(item => item.id === target.id));
    });
    const choice = ready ?? remaining[0];
    const rest = remaining.filter(other => other !== choice);
    const preferred = plan.positions.find(position => position.id === choice.item.id)!;
    const positions = isWallMounted(choice.item) ? wallTvPositions({ ...choice.item, ...preferred }, source.room, placed)
      : isChair(choice.item) ? [...chairPositions(choice.item, placed), ...choice.positions]
      : choice.item.kind === 'nightstand' ? [...bedsidePositions(choice.item, placed), ...choice.positions] : choice.positions;
    positions.sort((a, b) => displacement(a) - displacement(b));
    for (const candidate of positions) {
      if (outside(candidate, source.room) || (occupiesFloor(candidate) && furnitureEntranceZones(source.room, candidate).some(door => overlaps(footprint(candidate), door)))) continue;
      if (placed.some((other) => placementConflict(candidate, other))) continue;
      if (!functionalPlacementAllowed(candidate, source.room, placed, workDepth)) continue;
      const partial = { ...source, furniture: [...placed, candidate] };
      if (usabilityIssues(partial).length) continue;
      // Once all beds are known, no later floor furniture can create a missing
      // TV mounting/viewing position. Reject that bed orientation immediately.
      if (isBed(candidate.kind) && !rest.some(other => isBed(other.item.kind))
        && rest.filter(other => isWallMounted(other.item)).some(other => !wallTvPositions({ ...other.item,
          ...plan.positions.find(position => position.id === other.item.id)! }, source.room, partial.furniture).length)) continue;
      const knownIds = new Set(partial.furniture.map((item) => item.id));
      const knownRules = plan.requirements.filter((rule) => knownIds.has(rule.itemId) &&
        (isRoomTarget(rule.targetId) || knownIds.has(rule.targetId)));
      if (!knownRules.every((rule) => requirementSatisfied(partial, rule))) continue;
      // Later pieces cannot reopen a blocked route. Prune it before exploring
      // hundreds of arrangements that would all fail the final access check.
      if (inaccessibleFurniture(partial).length) continue;
      const diningChairs = rest.filter(other => other.item.kind === 'chair').map(other => other.item);
      const sofas = rest.filter(other => isSofa(other.item)).map(other => other.item);
      const seatingGroup = isTelevision(candidate) && sofas.length && source.furniture.filter(isTelevision).length === 1;
      const groups = seatingGroup ? loungeGroups(candidate, sofas, source.room)
        : candidate.kind === 'dining-table' && source.furniture.filter(item => item.kind === 'dining-table').length === 1
        && !source.furniture.some(item => item.kind === 'desk' || item.kind === 'vanity')
        ? diningChairGroups(candidate, diningChairs) : [];
      if (seatingGroup && !groups.length) continue;
      if (groups.length) {
        const groupCost = (group: Furniture[]) => group.reduce((sum, item) => sum + displacement(item), 0)
          + (candidate.kind === 'dining-table' ? diningSeatingPenalty(candidate, group) * 1000 : 0);
        const nearestGroups = [...groups].sort((a, b) => groupCost(a) - groupCost(b));
        let accepted = 0;
        for (const group of nearestGroups) {
          if (Date.now() > deadline) return false;
          const furniture = [...partial.furniture];
          if (!group.every(seat => {
            if (outside(seat, source.room) || furnitureEntranceZones(source.room, seat).some(zone => overlaps(footprint(seat), zone))
              || furniture.some(other => placementConflict(seat, other))
              || !functionalPlacementAllowed(seat, source.room, furniture, workDepth)) return false;
            furniture.push(seat); return true;
          })) continue;
          // Test the complete dining + viewing arrangement before accepting
          // seats that leave no usable TV/sofa zone. Rank it against Gemini's
          // coordinates; do not replace the proposal with a regular layout.
          const televisions = rest.filter(other => isTelevision(other.item));
          let companions: Furniture[] = [];
          if (candidate.kind === 'dining-table' && televisions.length === 1 && sofas.length) {
            const tv = proposedItems.find(item => item.id === televisions[0].item.id)!;
            const lounge = findLoungeGroup(tv, sofas, source.room, furniture, workDepth, groupScore);
            if (!lounge) continue;
            companions = lounge;
            furniture.push(...lounge);
          }
          const grouped = { ...source, furniture };
          if (usabilityIssues(grouped).length || inaccessibleFurniture(grouped).length) continue;
          const ids = new Set(furniture.map(item => item.id));
          if (!plan.requirements.filter(rule => ids.has(rule.itemId) && (isRoomTarget(rule.targetId) || ids.has(rule.targetId)))
            .every(rule => requirementSatisfied(grouped, rule))) continue;
          if (++accepted > 4) break;
          placed.push(candidate, ...group, ...companions);
          const chairIds = new Set([...group, ...companions].map(seat => seat.id));
          if (search(rest.filter(other => !chairIds.has(other.item.id)))) return true;
          placed.splice(placed.length - group.length - companions.length - 1);
        }
        continue;
      }
      if (++tried > 80) break;
      placed.push(candidate);
      if (search(rest)) return true;
      placed.pop();
    }
    return false;
  }
  if (!search(choices)) return null;

  const repaired: AiPlan = {
    ...plan,
    positions: placed.map(({ id, x, y, rotated, rotation }) => ({ id, x, y, rotated, rotation })),
    explanation: 'Furniture positions were adjusted to fit the room while preserving the placement conditions understood by AI.',
    adjusted: true,
  };
  const checked = checkAiPlan(repaired, source, prompt, review);
  return checked.ok ? checked.plan : null;
}
