import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FurnitureShape } from '../../src/components/FurnitureShape';
import IsoCanvas from '../../src/components/IsoCanvas';
import PlanCanvas from '../../src/components/PlanCanvas';
import { furniture, project } from './fixtures';
import type { FurnitureKind } from '../../src/domain/model';

describe('wardrobe drawings', () => {
  it('identifies the wardrobe with a descriptive accessible label', () => {
    render(<svg><FurnitureShape item={furniture({ kind: 'wardrobe', width: 80, depth: 55 })} /></svg>);
    expect(screen.getByRole('img', { name: 'Two-door wardrobe' })).toBeInTheDocument();
    expect(screen.getByText('WARDROBE')).toBeInTheDocument();
  });
  it('keeps clothes and the cabinet outline in small plan previews', () => {
    const { container } = render(<svg><FurnitureShape item={furniture({ kind: 'wardrobe' })} mini /></svg>);
    expect(container.querySelectorAll('[data-wardrobe-part="clothes"]')).toHaveLength(3);
    expect(screen.queryByText('WARDROBE')).not.toBeInTheDocument();
  });
  it.each([[20, 20], [80, 55], [400, 400], [40, 160]])('scales a %s × %s wardrobe without invalid dimensions', (width, depth) => {
    const { container } = render(<svg><FurnitureShape item={furniture({ kind: 'wardrobe', width, depth })} /></svg>);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector('[data-shape="wardrobe"] > g')).toHaveAttribute('transform', `scale(${width / 100} ${depth / 100})`);
    for (const rect of container.querySelectorAll('rect')) {
      expect(Number(rect.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(rect.getAttribute('height'))).toBeGreaterThan(0);
    }
  });
  it.each([false, true])('3D wardrobe has two separate panelled doors and handles (rotated=%s)', (rotated) => {
    const source = project(); source.furniture = [furniture({ kind: 'wardrobe', id: 'wardrobe-1', name: 'Wardrobe 1', width: 80, depth: 55, rotated })];
    const { container } = render(<IsoCanvas project={source} />);
    expect(screen.getByRole('img', { name: 'Wardrobe 1, two-door wardrobe' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-wardrobe-part="door"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-wardrobe-part="handle"]')).toHaveLength(2);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it('rotates the 2D drawing with its measured footprint', () => {
    const source = project(); source.furniture = [furniture({ kind: 'wardrobe', width: 80, depth: 55, rotated: true })];
    const { container } = render(<PlanCanvas project={source} />);
    expect(container.querySelector('[data-furniture] > g')).toHaveAttribute('transform', 'translate(55 0) rotate(90)');
  });
  it('uses shelf and wardrobe labels distinctly in 3D', () => {
    const source = project(); source.furniture = [furniture({ kind: 'shelf' })];
    render(<IsoCanvas project={source} />);
    expect(screen.getByText('Shelf')).toBeInTheDocument(); expect(screen.queryByText('Wardrobe')).not.toBeInTheDocument();
  });
  it('3D zoom changes viewing scale without editing furniture', () => {
    const source = project(); const before = structuredClone(source);
    const { container, rerender } = render(<IsoCanvas project={source} />);
    const svg = container.querySelector('svg')!; const box = svg.getAttribute('viewBox');
    rerender(<IsoCanvas project={source} zoom={2} />);
    expect(svg.getAttribute('viewBox')).not.toBe(box); expect(source).toEqual(before);
  });
  it.each(['bed', 'desk', 'wardrobe', 'shelf', 'plant', 'rug'] as FurnitureKind[])('renders %s without invalid SVG coordinates', (kind) => {
    const { container } = render(<svg><FurnitureShape item={furniture({ kind })} /></svg>);
    expect(container.querySelector('svg')?.children.length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
