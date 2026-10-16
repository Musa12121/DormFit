import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import PlanCanvas from '../../src/components/PlanCanvas';
import { project, furniture } from './fixtures';

function setup(overrides: Partial<ComponentProps<typeof PlanCanvas>> = {}) {
  const onMove = vi.fn(), onSelect = vi.fn(), onRotate = vi.fn(), onDelete = vi.fn();
  const view = render(<PlanCanvas project={project()} onMove={onMove} onSelect={onSelect}
    onRotate={onRotate} onDelete={onDelete} {...overrides} />);
  return { ...view, onMove, onSelect, onRotate, onDelete };
}
const bed = () => screen.getByRole('button', { name: /^Bed 1,/ });

describe('measured 2D editor', () => {
  it('exposes named selectable furniture with measured sizes', () => {
    setup(); expect(bed()).toHaveAccessibleName('Bed 1, 100 × 200 centimetres');
    expect(bed()).toHaveAttribute('aria-pressed', 'false');
  });
  it.each([
    ['ArrowLeft', 5, 100], ['ArrowRight', 15, 100], ['ArrowUp', 10, 95], ['ArrowDown', 10, 105],
  ])('%s moves furniture five centimetres', (key, x, y) => {
    const { onMove } = setup(); fireEvent.keyDown(bed(), { key });
    expect(onMove).toHaveBeenCalledWith('bed-1', x, y);
  });
  it('Shift plus an arrow moves ten centimetres', () => {
    const { onMove } = setup(); fireEvent.keyDown(bed(), { key: 'ArrowRight', shiftKey: true });
    expect(onMove).toHaveBeenCalledWith('bed-1', 20, 100);
  });
  it('keyboard movement clamps furniture to room bounds', () => {
    const source = project(); source.furniture[0].x = 0;
    const { onMove } = setup({ project: source }); fireEvent.keyDown(bed(), { key: 'ArrowLeft' });
    expect(onMove).toHaveBeenCalledWith('bed-1', 0, 100);
  });
  it.each(['r', 'R'])('%s asks to rotate the selected item', (key) => {
    const { onRotate } = setup(); fireEvent.keyDown(bed(), { key }); expect(onRotate).toHaveBeenCalledOnce();
  });
  it.each(['Delete', 'Backspace'])('%s asks to delete an item', (key) => {
    const { onDelete } = setup(); fireEvent.keyDown(bed(), { key }); expect(onDelete).toHaveBeenCalledOnce();
  });
  it('unrelated keys do not edit the plan', () => {
    const { onMove, onRotate, onDelete } = setup(); fireEvent.keyDown(bed(), { key: 'a' });
    expect(onMove).not.toHaveBeenCalled(); expect(onRotate).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
  });
  it('focus selects a furniture item', () => {
    const { onSelect } = setup(); fireEvent.focus(bed()); expect(onSelect).toHaveBeenCalledWith('bed-1');
  });
  it('selected furniture announces its selection state', () => {
    setup({ selected: 'bed-1' }); expect(bed()).toHaveAttribute('aria-pressed', 'true');
  });
  it('mini previews are not keyboard-editable furniture controls', () => {
    const { container } = setup({ mini: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
  });
  it('rotation swaps the displayed footprint without changing the stored sizes', () => {
    const source = project(); source.furniture[0].rotated = true;
    const { container } = setup({ project: source });
    expect(container.querySelector('[data-furniture="bed-1"] > g')).toHaveAttribute('transform', 'translate(200 0) rotate(90)');
    expect(bed()).toHaveAccessibleName('Bed 1, 100 × 200 centimetres');
  });
  it('zoom changes the SVG view box while preserving full export bounds', () => {
    const { container, rerender } = setup();
    const svg = container.querySelector('svg')!; const base = svg.getAttribute('viewBox');
    rerender(<PlanCanvas project={project()} zoom={2} />);
    expect(svg.getAttribute('viewBox')).not.toBe(base);
    expect(svg.getAttribute('data-base-view-box')).toBe(base);
  });
  it('hides dimension labels when requested', () => {
    setup({ showDimensions: false }); expect(screen.queryByText('420 cm')).not.toBeInTheDocument();
  });
  it('renders rugs beneath solid furniture regardless of input order', () => {
    const source = project(); source.furniture.push(furniture({ id: 'rug-1', kind: 'rug', width: 120, depth: 120 }));
    const { container } = setup({ project: source });
    expect(container.querySelector('[data-furniture]')).toHaveAttribute('data-furniture', 'rug-1');
  });
});
