import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import LayoutSuggestions from '../../src/components/LayoutSuggestions';
import { checkAiPlanBestEffort } from '../../src/domain/ai';
import { generateLayouts } from '../../src/domain/planner';
import { project, aiPlan } from './fixtures';

function setup(overrides: Partial<ComponentProps<typeof LayoutSuggestions>> = {}) {
  const onSelect = vi.fn(), onGenerate = vi.fn(), onEdit = vi.fn();
  const props = {
    layouts: generateLayouts(project()), activeId: 'balanced', busy: false,
    aiOptions: { enabled: false, prompt: '' }, aiStatus: { kind: 'idle' } as const,
    onAiOptionsChange: vi.fn(), onSelect, onGenerate, onEdit, ...overrides,
  };
  return { ...render(<LayoutSuggestions {...props} />), onSelect, onGenerate, onEdit, props };
}
function success(plan = aiPlan(), activeId = 'ai') {
  const checked = checkAiPlanBestEffort(plan, project(), 'Place the plant near the window.');
  if (!checked.ok) throw new Error('Invalid test fixture');
  return setup({ layouts: [checked.layout, ...generateLayouts(project())], activeId,
    aiStatus: { kind: 'success', plan }, aiOptions: { enabled: true, prompt: 'Place the plant near the window.' } });
}

describe('layout suggestions and AI feedback', () => {
  it('labels local alternatives as not applying the written note', () => {
    const { container } = setup();
    expect(container.querySelectorAll('[data-layout-id]')).toHaveLength(3);
    expect(screen.getAllByText('Regular layout · notes not applied')).toHaveLength(3);
  });
  it('selects a complete measured layout when a card is clicked', () => {
    const { container, onSelect, props } = setup();
    fireEvent.click(container.querySelector('[data-layout-id="daylight"]')!);
    expect(onSelect).toHaveBeenCalledWith(props.layouts[1]);
  });
  it('offers input editing', () => {
    const { onEdit } = setup(); fireEvent.click(screen.getByRole('button', { name: /Change sizes and quantities/ }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
  it('explains when the search finds fewer than three distinct regular arrangements', () => {
    setup({ layouts: generateLayouts(project()).slice(0, 1) });
    expect(screen.getByText('The search found fewer than three distinct arrangements.')).toBeVisible();
  });
  it('offers regeneration when layouts have been invalidated', () => {
    const { onGenerate } = setup({ layouts: [] });
    fireEvent.click(screen.getByRole('button', { name: /Find new layouts/ }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
  it('disables regeneration while waiting', () => {
    setup({ busy: true }); expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
  it('warns when no calculated layout is conflict-free', () => {
    setup({ layouts: generateLayouts(project()).map((layout) => ({ ...layout, issueCount: 2 })) });
    expect(screen.getByRole('alert')).toHaveTextContent('Some layout options have warnings');
  });
  it('explains that loading local layouts do not apply the note', () => {
    setup({ aiStatus: { kind: 'loading' }, busy: true });
    expect(screen.getByRole('status')).toHaveTextContent('Gemini is creating a layout for your room');
    expect(screen.getByRole('status')).toHaveTextContent('do not use your notes');
  });
  it('shows actual AI layout and the interpreted plant/window requirement', () => {
    const { container } = success();
    expect(container.querySelectorAll('[data-layout-id]')).toHaveLength(4);
    expect(screen.getByRole('status')).toHaveTextContent('Plant 1 → window: near');
    expect(screen.getByText('Gemini layout')).toBeVisible();
    expect(screen.getByRole('region', { name: 'AI-designed layout' })).toContainElement(container.querySelector('[data-layout-id="ai"]'));
    expect(screen.getByRole('region', { name: 'Algorithm layouts' }).querySelectorAll('[data-layout-id]')).toHaveLength(3);
    expect(screen.getByText('DESIGNED BY GEMINI AI')).toBeVisible();
  });
  it('warns when the user selects a local alternative after AI succeeds', () => {
    success(aiPlan(), 'balanced'); expect(screen.getByRole('status')).toHaveTextContent('A regular layout is currently selected');
  });
  it('shows unfulfilled requests and labels the plan as partial', () => {
    const plan = aiPlan(); plan.unmetRequests = ['Could not verify the walkway width.']; success(plan);
    expect(screen.getByRole('note')).toHaveTextContent('Could not verify the walkway width.');
    expect(screen.getByText('AI layout · partially matched')).toBeVisible();
  });
  it('shows a best-effort layout and marks a missed preference', () => {
    const plan = aiPlan();
    plan.positions.find(position => position.id === 'plant-1')!.x = 330;
    plan.positions.find(position => position.id === 'plant-1')!.y = 300;
    const review = {
      requirements: [
        { itemId: 'plant-1', targetId: 'window', relation: 'near' as const },
        { itemId: 'bed-1', targetId: 'left-wall', relation: 'near' as const },
      ],
      unmetRequests: ['Keep the center clear.'],
    };
    plan.requirements = [review.requirements[1]];
    plan.unmetRequests = [];
    const checked = checkAiPlanBestEffort(plan, project(), 'Place the plant near the window.', review);
    if (!checked.ok) throw new Error('Expected a best-effort layout');
    expect(checked.plan.requirements).toEqual(review.requirements);
    expect(checked.plan.unmetRequests).toContain('Keep the center clear.');
    setup({ layouts: [checked.layout, ...generateLayouts(project())], activeId: 'ai',
      aiStatus: { kind: 'success', plan: checked.plan },
      aiOptions: { enabled: true, prompt: 'Place the plant near the window.' } });
    expect(screen.getByRole('status')).toHaveTextContent('Gemini made a best-effort layout');
    expect(screen.getByRole('status')).toHaveTextContent('Not met; layout shown anyway');
    expect(screen.getByText('AI layout · partially matched')).toBeVisible();
  });
  it('discloses coordinate repair rather than claiming untouched model output', () => {
    const plan = aiPlan(); plan.adjusted = true; success(plan);
    expect(screen.getByRole('status')).toHaveTextContent('The app adjusted the positions to fit the room');
  });
  it('displays a service failure and one fallback explanation', () => {
    setup({ aiStatus: { kind: 'fallback', message: 'The request limit has been reached. (GEMINI_QUOTA)' } });
    expect(screen.getByRole('status')).toHaveTextContent('GEMINI_QUOTA');
    expect(screen.getAllByText('Regular layouts do not use your written notes.')).toHaveLength(1);
  });
});
