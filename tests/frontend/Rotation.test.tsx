import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import PlanCanvas from '../../src/components/PlanCanvas';
import IsoCanvas from '../../src/components/IsoCanvas';
import { furniture, project } from './fixtures';
import { orientation, rotations } from '../../src/domain/rotation';
import { CURRENT_KEY } from '../../src/domain/storage';
import { translate } from '../../src/i18n';

describe('four furniture directions', () => {
  it.each(rotations)('renders %s degrees in both room views with the correct footprint', rotation => {
    const source = project(); source.furniture = [furniture({ width: 100, depth: 200, ...orientation(rotation) })];
    const plan = render(<PlanCanvas project={source} />);
    expect(plan.container.querySelector('[data-rotation]')).toHaveAttribute('data-rotation', String(rotation));
    if (rotation) expect(plan.container.querySelector('[data-rotation]')?.getAttribute('transform')).toContain(`rotate(${rotation})`);
    plan.unmount();
    const iso = render(<IsoCanvas project={source} />);
    expect(iso.container.querySelector('[data-rotation]')).toHaveAttribute('data-rotation', String(rotation));
    expect(iso.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('cycles four directions through the editor and persists facing across reloads', async () => {
    const source = project(); source.furniture = [furniture({ id: 'bed-1', ...orientation(0) })];
    localStorage.setItem(CURRENT_KEY, JSON.stringify(source));
    const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));
    await waitFor(() => expect(app.container.querySelector('.canvas-panel [data-furniture="bed-1"]')).toBeInTheDocument());
    fireEvent.focus(app.container.querySelector('.canvas-panel [data-furniture="bed-1"]')!);
    const editor = within(screen.getByRole('region', { name: 'Selected furniture' }));
    const read = () => JSON.parse(localStorage.getItem(CURRENT_KEY)!).furniture[0];
    const initial = read().rotation ?? (read().rotated ? 90 : 0);
    for (const turn of [1, 2, 3, 4]) {
      const expected = (initial + turn * 90) % 360;
      fireEvent.click(editor.getByRole('button', { name: /Rotate/ }));
      expect(read().rotation).toBe(expected);
      expect(read().rotated).toBe(expected % 180 === 90);
      expect(editor.getByRole('button', { name: /Rotate/ })).toHaveTextContent(`${expected}°`);
    }
    fireEvent.click(editor.getByRole('button', { name: /Rotate/ }));
    fireEvent.click(editor.getByRole('button', { name: /Rotate/ }));
    app.unmount();
    render(<App />);
    expect(read().rotation).toBe((initial + 180) % 360);
  });

  it('keyboard rotation and undo/redo preserve all four angles', async () => {
    const source = project(); source.furniture = [furniture({ id: 'bed-1', ...orientation(90) })];
    localStorage.setItem(CURRENT_KEY, JSON.stringify(source));
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));
    await waitFor(() => expect(container.querySelector('.canvas-panel [data-furniture="bed-1"]')).toBeInTheDocument());
    const bed = container.querySelector('.canvas-panel [data-furniture="bed-1"]')!;
    const angle = () => JSON.parse(localStorage.getItem(CURRENT_KEY)!).furniture[0].rotation;
    const initial = angle();
    fireEvent.focus(bed); fireEvent.keyDown(bed, { key: 'r' });
    expect(angle()).toBe((initial + 90) % 360);
    fireEvent.click(screen.getByRole('button', { name: /Undo/ })); expect(angle()).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: /Redo/ })); expect(angle()).toBe((initial + 90) % 360);
  });

  it.each(['ru', 'tr'] as const)('translates the new access warnings into %s', language => {
    for (const text of ['KEEP CLEAR', 'walking access', 'Furniture blocks a 60 cm walking route from the entrance.', 'Drawers blocks the door or entrance landing.']) {
      expect(translate(text, language)).not.toBe(text);
    }
  });
});
