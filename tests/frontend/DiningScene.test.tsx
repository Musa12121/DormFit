import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import IsoCanvas from '../../src/components/IsoCanvas';
import { FurnitureShape } from '../../src/components/FurnitureShape';
import { emptyProject } from '../../src/domain/setup';
import { furniture } from './fixtures';

it.each([0, 90, 180, 270] as const)('draws four plates in both views at %s degrees', rotation => {
  const table = furniture({ id: 'table', kind: 'dining-table', width: 140, depth: 80, rotation, rotated: rotation % 180 === 90 });
  const flat = render(<svg><FurnitureShape item={table} /></svg>);
  expect(flat.container.querySelectorAll('[data-furniture-part="plate"]')).toHaveLength(4);
  flat.unmount();
  const iso = render(<IsoCanvas project={{ ...emptyProject(), furniture: [table] }} />);
  expect(iso.container.querySelectorAll('[data-furniture-part="plate"]')).toHaveLength(4);
  expect(iso.container.innerHTML).not.toMatch(/NaN|Infinity/);
});

it.each(['top', 'left', 'bottom', 'right'] as const)('keeps the %s window on the correct side of nearby furniture', wall => {
  const source = emptyProject();
  source.room.openings = [{ id: 'window', kind: 'window', wall, offset: 100, width: 150 }];
  source.furniture = [furniture({ id: 'chair', kind: 'chair', x: 100, y: 290, width: 45, depth: 45 })];
  const { container } = render(<IsoCanvas project={source} />);
  const window = container.querySelector('[data-opening="window"]')!;
  const chair = container.querySelector('[data-furniture="chair"]')!;
  const foreground = wall === 'bottom' || wall === 'right';
  expect(Boolean(chair.compareDocumentPosition(window) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(foreground);
  expect(window.querySelector('polygon')).toHaveAttribute('fill-opacity', foreground ? '0.35' : '1');
  expect(window).toHaveAttribute('pointer-events', 'none');
});
