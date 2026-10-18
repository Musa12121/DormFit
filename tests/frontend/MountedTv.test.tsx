import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import IsoCanvas from '../../src/components/IsoCanvas';
import { emptyProject } from '../../src/domain/setup';
import { furniture } from './fixtures';
import { footprint } from '../../src/domain/geometry';
import { orientation } from '../../src/domain/rotation';

it.each([0, 90, 180, 270] as const)('keeps a mounted TV attached to a visible wall below its top at %s degrees', rotation => {
  const item = furniture({ id: 'tv', kind: 'television', width: 100, depth: 25, wallMounted: true,
    x: rotation === 90 ? 395 : 0, y: rotation === 180 ? 335 : 0, ...orientation(rotation) });
  const project = { ...emptyProject(), furniture: [item] };
  const { container } = render(<IsoCanvas project={project} />);
  const support = container.querySelector('[data-tv-wall="tv"]');
  if (rotation === 90 || rotation === 180) expect(support).toBeInTheDocument();
  else expect(support).not.toBeInTheDocument(); // The full back/left walls already exist.
  expect(container.querySelector('[data-furniture-part="wall-mount"]')).toBeInTheDocument();
  expect(container.querySelector('[data-furniture-part="tv-feet"]')).not.toBeInTheDocument();
  const rect = footprint(item);
  const floorYs = [rect.x, rect.x + rect.width].flatMap(x => [rect.y, rect.y + rect.depth].map(y => x * .36 + y * .44));
  const screen = container.querySelector('[data-furniture-part="screen"]')!;
  const screenYs = screen.getAttribute('points')!.split(' ').map(point => Number(point.split(',')[1]));
  expect(Math.min(...screenYs)).toBeGreaterThanOrEqual(Math.min(...floorYs) - 80);
  expect(Math.max(...screenYs)).toBeLessThan(Math.max(...floorYs));
});

it.each([0, 90, 180, 270] as const)('draws the keyboard separately and hides the back of the monitor screen at %s degrees', rotation => {
  const item = furniture({ kind: 'desk', width: 120, depth: 65, ...orientation(rotation) });
  const { container } = render(<IsoCanvas project={{ ...emptyProject(), furniture: [item] }} />);
  expect(container.querySelector('[data-furniture-part="keyboard"]')).toBeInTheDocument();
  expect(container.querySelector('[data-furniture-part="monitor"]')).toBeInTheDocument();
  const parts = [...container.querySelectorAll('[data-desk-accessory]')].map(element => element.getAttribute('data-desk-accessory'));
  expect(parts).toEqual(rotation === 0 || rotation === 270 ? ['monitor', 'keyboard'] : ['keyboard', 'monitor']);
  expect(Boolean(container.querySelector('[data-furniture-part="monitor-screen"]'))).toBe(rotation === 0 || rotation === 270);
});
