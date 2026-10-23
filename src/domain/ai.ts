import type { Project, Furniture, Room, Rotation } from './model.ts';
import { furnitureLabels, supportedFurniture } from './model.ts';
import { orientation, rotations, rotationOf } from './rotation.ts';
import { analyze, clampItem, footprint } from './planner.ts';
import type { LayoutOption } from './planner.ts';
import { getOpenings, openingLabel, openingSegment } from './openings.ts';
import { requiresFourSeatDining } from './usability.ts';

// A restarted backend must speak the same coordinate-based protocol as the browser.
export const AI_PROTOCOL = 'layout-independent-ai-v14';

export interface AiOptions {
  enabled: boolean;
  prompt: string;
}

export interface PlacementRequirement {
  itemId: string;
  targetId: string;
  relation: 'near' | 'away';
}

export interface PreferenceReview {
  requirements: PlacementRequirement[];
  unmetRequests: string[];
}

export interface AiPlan {
  omittedChairIds?: string[];
  positions: { id: string; x: number; y: number; rotated: boolean; rotation?: Rotation }[];
  requirements: PlacementRequirement[];
  unmetRequests: string[];
  explanation: string;
  tips: string[];
  adjusted?: boolean;
  partial?: boolean;
}

export type AiStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'fallback'; message: string }
  | { kind: 'success'; plan: AiPlan; language?: 'en' | 'ru' | 'tr' };

type PlanCheck =
  | { ok: true; plan: AiPlan; layout: LayoutOption }
  | { ok: false; problems: string[] };

const targetLabels: Record<string, string> = {
  window: 'window', door: 'door',
  'left-wall': 'left wall', 'right-wall': 'right wall',
  'top-wall': 'top wall', 'bottom-wall': 'bottom wall',
  center: 'room centre',
};

export const isRoomTarget = (id: string) => Object.hasOwn(targetLabels, id) || id.startsWith('opening-');

export function targetOptions(project: Project) {
  const openings = getOpenings(project.room);
  return [
    ...Object.entries(targetLabels).filter(([id]) => id !== 'window' && id !== 'door'
      || openings.some((opening) => opening.kind === id)).map(([id, label]) => ({ id, label })),
    ...openings.map((opening) => ({ id: opening.id, label: `${openingLabel(project.room, opening)} (${opening.wall} wall)` })),
    ...project.furniture.map((item) => ({ id: item.id, label: item.name })),
  ];
}

export function validRequirements(value: unknown, project: Project): value is PlacementRequirement[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  const ids = new Set(project.furniture.map((item) => item.id));
  const targets = new Set(targetOptions(project).map((target) => target.id));
  return value.every((rule) => rule && ids.has(rule.itemId) && targets.has(rule.targetId)
    && rule.itemId !== rule.targetId && ['near', 'away'].includes(rule.relation));
}

export function isPreferenceReview(value: unknown, project: Project): value is PreferenceReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as PreferenceReview;
  return validRequirements(review.requirements, project) && Array.isArray(review.unmetRequests)
    && review.unmetRequests.length <= 8 && review.unmetRequests.every((note) => typeof note === 'string' && note.trim().length > 0 && note.length <= 300);
}

// Understand one clear English placement rule locally, so a simple note does
// not depend on a model returning IDs in exactly the expected format.
export function interpretSimplePreference(project: Project, note: string): PreferenceReview | null {
  const matches = [...note.matchAll(/\b(close to|next to|far from|away from|near)\b/gi)];
  if (matches.length !== 1) return null;

  const match = matches[0];
  const start = match.index ?? 0;
  let subject = note.slice(0, start).trim();
  let target = note.slice(start + match[0].length).trim();
  const command = /^(?:please\s+)?(?:place|put|keep|position|move)\s+/i.test(subject);
  if (command) subject = subject.replace(/^(?:please\s+)?(?:place|put|keep|position|move)\s+/i, '');

  const predicate = /\s+(?:should|must)\s+be$|\s+(?:needs|has)\s+to\s+be$|\s+(?:is|are|sit|sits|go|goes)$/i;
  const hasPredicate = predicate.test(subject);
  if (hasPredicate) subject = subject.replace(predicate, '');
  if (!command && !hasPredicate) return null;

  const normalize = (value: string) => value.toLowerCase().trim()
    .replace(/[.!?,;:]+$/g, '').replace(/\s+/g, ' ');
  subject = normalize(subject.replace(/^(?:the|a|an)\s+/i, ''));
  target = normalize(target.replace(/^(?:the|a|an)\s+/i, ''));
  if (!subject || !target) return null;

  const numberedSubject = /^(.*?)\s+(\d+)$/.exec(subject);
  const baseSubject = numberedSubject?.[1] ?? subject;
  const entry = supportedFurniture.find((item) => [
    item.name,
    item.kind.replaceAll('-', ' '),
    furnitureLabels[item.kind],
  ].some((label) => normalize(label) === baseSubject));
  if (!entry) return null;

  const items = project.furniture.filter((item) => item.kind === entry.kind
    && (!numberedSubject || normalize(item.name) === subject));
  if (!items.length) {
    return { requirements: [], unmetRequests: [`${entry.name} is not selected, so this condition cannot be applied.`] };
  }

  const targetOption = targetOptions(project).find((option) => {
    const label = option.label.replace(/\s*\([^)]*\)\s*$/, '');
    return normalize(option.id) === target || normalize(label) === target;
  });
  if (!targetOption) {
    const opening = /^(window|door)(?:\s+\d+)?$/.exec(target);
    if (opening && !getOpenings(project.room).some((item) => item.kind === opening[1])) {
      return { requirements: [], unmetRequests: [`There is no ${opening[1]} in the room, so this condition cannot be applied.`] };
    }
    return null;
  }

  const relation = /^(?:near|close to|next to)$/i.test(match[0]) ? 'near' : 'away';
  const review: PreferenceReview = {
    requirements: items.map((item) => ({ itemId: item.id, targetId: targetOption.id, relation })),
    unmetRequests: [],
  };
  return isPreferenceReview(review, project) ? review : null;
}

// Distance is between footprint edges, not their centres. Window/door are wall segments.
function targetRect(targetId: string, room: Room, furniture: Furniture[]) {
  const { width, depth } = room;
  switch (targetId) {
    case 'left-wall': return { x: 0, y: 0, width: 0, depth };
    case 'right-wall': return { x: width, y: 0, width: 0, depth };
    case 'top-wall': return { x: 0, y: 0, width, depth: 0 };
    case 'bottom-wall': return { x: 0, y: depth, width, depth: 0 };
    case 'center': return { x: width / 2, y: depth / 2, width: 0, depth: 0 };
    default: {
      const opening = getOpenings(room).find((item) => item.id === targetId);
      if (opening) return openingSegment(room, opening);
      const other = furniture.find((item) => item.id === targetId);
      return other ? footprint(other) : null;
    }
  }
}

export function requirementDistance(project: Project, requirement: PlacementRequirement) {
  const item = project.furniture.find((item) => item.id === requirement.itemId);
  if (!item) return Infinity;
  const rect = footprint(item);
  const targets = ['window', 'door'].includes(requirement.targetId)
    ? getOpenings(project.room).filter((opening) => opening.kind === requirement.targetId).map((opening) => openingSegment(project.room, opening))
    : [targetRect(requirement.targetId, project.room, project.furniture)].filter((target) => target !== null);
  if (targets.length === 0) return Infinity;
  return Math.min(...targets.map((target) => Math.hypot(
    Math.max(target.x - rect.x - rect.width, rect.x - target.x - target.width, 0),
    Math.max(target.y - rect.y - rect.depth, rect.y - target.y - target.depth, 0),
  )));
}

export function requirementLabel(project: Project, requirement: PlacementRequirement) {
  const item = project.furniture.find((item) => item.id === requirement.itemId)?.name;
  const target = targetOptions(project).find((option) => option.id === requirement.targetId)?.label;
  return `${item} → ${target}: ${requirement.relation === 'near' ? 'near' : 'away'}`;
}

export function requirementSatisfied(project: Project, rule: PlacementRequirement) {
  const distance = requirementDistance(project, rule);
  return Number.isFinite(distance) && (rule.relation === 'near' ? distance <= 60 : distance >= 100);
}

// Only explicitly reported chairs may be left out. Every other original ID and size stays intact.
export function readAiPlan(value: unknown, source: Project, prompt = '', review?: PreferenceReview, allowPartialReview = false):
  { ok: true; plan: AiPlan } | { ok: false; problems: string[] } {
  const fail = (message: string): { ok: false; problems: string[] } => ({ ok: false, problems: [message] });
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!value || typeof value !== 'object') return fail('Expected a plan object.');
  const plan = value as AiPlan;
  if (
    !text(plan.explanation, 1200) ||
    !Array.isArray(plan.tips) || plan.tips.length > 3 || !plan.tips.every((tip) => text(tip, 300)) ||
    !Array.isArray(plan.unmetRequests) || plan.unmetRequests.length > 8 ||
    !plan.unmetRequests.every((note) => text(note, 300)) ||
    !Array.isArray(plan.requirements) || plan.requirements.length > 30 ||
    !Array.isArray(plan.positions)
  ) return fail('Missing or invalid positions, requirements, explanation, tips or unmetRequests.');
  if (!review && prompt.trim() && plan.requirements.length === 0 && plan.unmetRequests.length === 0) {
    return fail('A note was supplied. Extract its spatial requirements or explain unsupported requests in unmetRequests.');
  }

  const ids = new Set(source.furniture.map((item) => item.id));
  const omitted = plan.omittedChairIds ?? [];
  if (!Array.isArray(omitted) || omitted.length > source.furniture.length
    || new Set(omitted).size !== omitted.length || omitted.some(id => typeof id !== 'string'
      || !source.furniture.some(item => item.id === id && ['chair', 'office-chair'].includes(item.kind)))
    || plan.positions.length + omitted.length !== source.furniture.length) {
    return fail('Return every original furniture ID exactly once, either positioned or explicitly omitted as a chair.');
  }
  const seen = new Set<string>();
  for (const position of plan.positions) {
    if (
      !position || !ids.has(position.id) || omitted.includes(position.id) || seen.has(position.id) ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
      (position.rotation === undefined ? typeof position.rotated !== 'boolean'
        : !rotations.includes(position.rotation) || (position.rotated !== undefined && position.rotated !== (position.rotation % 180 === 90)))
    ) return fail('Return every original furniture ID exactly once, with finite x/y and a valid rotation.');
    seen.add(position.id);
  }
  if (!validRequirements(plan.requirements, source)) return fail('Requirement IDs/relations must refer to supplied furniture and supported targets.');
  if (review) {
    if (!isPreferenceReview(review, source)) return fail('Invalid reviewed requirements.');
    const signature = (rules: PlacementRequirement[]) => rules.map((rule) => `${rule.itemId}|${rule.targetId}|${rule.relation}`).sort().join('\n');
    if (allowPartialReview) {
      const confirmed = new Set(review.requirements.map(rule => `${rule.itemId}|${rule.targetId}|${rule.relation}`));
      if (plan.requirements.some(rule => !confirmed.has(`${rule.itemId}|${rule.targetId}|${rule.relation}`))) {
        return fail('Do not add or change user-confirmed requirements.');
      }
    } else if (signature(review.requirements) !== signature(plan.requirements)) {
      return fail('Preserve exactly the user-confirmed requirements.');
    }
    if (!allowPartialReview && !review.unmetRequests.every((note) => plan.unmetRequests.includes(note))) return fail('Preserve the reviewed unsupported requests.');
  }

  return { ok: true, plan: {
    ...(omitted.length ? { omittedChairIds: [...omitted] } : {}),
    positions: plan.positions.map(position => ({ id: position.id, x: position.x, y: position.y,
      rotated: position.rotation === undefined ? position.rotated : position.rotation % 180 === 90,
      ...(position.rotation === undefined ? {} : { rotation: position.rotation }) })),
    requirements: (allowPartialReview && review ? review.requirements : plan.requirements)
      .map(({ itemId, targetId, relation }) => ({ itemId, targetId, relation })),
    unmetRequests: [...new Set([...(review?.unmetRequests ?? []), ...plan.unmetRequests])],
    explanation: plan.explanation,
    tips: [...plan.tips],
    ...(plan.adjusted === true ? { adjusted: true } : {}),
    ...(plan.partial === true ? { partial: true } : {}),
  } };
}

function projectForAiPlan(plan: AiPlan, source: Project) {
  const omitted = new Set(plan.omittedChairIds ?? []);
  const project = structuredClone(source);
  project.omittedChairs = [...(source.omittedChairs ?? []), ...source.furniture.filter(item => omitted.has(item.id))];
  project.furniture = project.furniture.filter(item => !omitted.has(item.id)).map((item) => {
    const position = plan.positions.find((position) => position.id === item.id)!;
    return { ...item, x: position.x, y: position.y, ...orientation(rotationOf(position)) };
  });
  return project;
}

function aiLayout(plan: AiPlan, project: Project, issueCount: number): LayoutOption {
  const partial = plan.partial === true || issueCount > 0 || plan.unmetRequests.length > 0 || plan.omittedChairIds?.length;
  return {
    id: 'ai',
    name: partial ? 'AI layout · partially matched' : 'AI layout for your preferences',
    description: plan.adjusted ? 'AI layout adjusted to fit the room' : 'Gemini placed the furniture',
    project,
    issueCount,
  };
}

export function checkAiPlan(value: unknown, source: Project, prompt = '', review?: PreferenceReview): PlanCheck {
  const parsed = readAiPlan(value, source, prompt, review);
  if (!parsed.ok) return parsed;
  const plan = parsed.plan;
  const project = projectForAiPlan(plan, source);
  const problems = analyze(project).issues.map((issue) => `${issue.type}: ${issue.ids.join(', ')}`);
  if (requiresFourSeatDining(source.furniture) && project.furniture.filter(item => item.kind === 'chair').length !== 4) {
    problems.push('facing: Keep all four dining chairs, with two on each opposite long side.');
  }
  for (const rule of plan.requirements) {
    const distance = requirementDistance(project, rule);
    if (!requirementSatisfied(project, rule)) {
      problems.push(`${rule.itemId} must be ${rule.relation} ${rule.targetId}; actual distance ${Math.round(distance)} cm.`);
    }
  }
  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    plan: plan.unmetRequests.length || plan.omittedChairIds?.length ? { ...plan, partial: true } : plan,
    layout: aiLayout(plan, project, 0),
  };
}

// Keep a usable, editable AI suggestion when its positions cannot pass every
// planning check. The UI shows the failed checks and marks missed preferences.
export function checkAiPlanBestEffort(value: unknown, source: Project, prompt = '', review?: PreferenceReview): PlanCheck {
  const checked = checkAiPlan(value, source, prompt, review);
  if (checked.ok) return checked;

  const parsed = readAiPlan(value, source, prompt, review, true);
  if (!parsed.ok) return parsed;

  let adjusted = parsed.plan.adjusted === true;
  const project = projectForAiPlan(parsed.plan, source);
  project.furniture = project.furniture.map(item => {
    const bounded = clampItem(item, project.room);
    if (bounded.x !== item.x || bounded.y !== item.y) adjusted = true;
    return bounded;
  });
  const positions = parsed.plan.positions.map(position => {
    const item = project.furniture.find(item => item.id === position.id)!;
    return { ...position, x: item.x, y: item.y };
  });
  const plan: AiPlan = {
    ...parsed.plan,
    positions,
    ...(adjusted ? { adjusted: true } : {}),
    partial: true,
  };
  const missedPreferences = plan.requirements.filter(requirement => !requirementSatisfied(project, requirement)).length;
  const issueCount = analyze(project).issues.length + missedPreferences;
  const name = issueCount || plan.unmetRequests.length || plan.omittedChairIds?.length
    ? 'AI layout · partially matched'
    : 'AI layout for your preferences';
  const layout = { ...aiLayout(plan, project, issueCount), name };
  return { ok: true, plan, layout };
}
