import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { catalog, furnitureLabels } from '../../src/domain/model';
import { FurnitureShape } from '../../src/components/FurnitureShape';
import IsoCanvas from '../../src/components/IsoCanvas';
import RoomSetup from '../../src/components/RoomSetup';
import App from '../../src/App';
import { emptyProject } from '../../src/domain/setup';
import { getLanguage, setLanguage, translate } from '../../src/i18n';
import { CURRENT_KEY } from '../../src/domain/storage';
import { furnitureIcons } from '../../src/components/furnitureIcons';
import { furniture } from './fixtures';

describe('expanded furniture catalog', () => {
  it('adds a wall-mounted TV directly without a checkbox and leaves the TV stand unchanged', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Example room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse furniture' }));
    fireEvent.click(container.querySelector('.catalog-television')!);
    expect(screen.queryByRole('checkbox', { name: 'Wall-mounted' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CURRENT_KEY)!).furniture.at(-1).wallMounted).toBe(true);
    expect(container.querySelector('#room-plan [data-furniture-part="wall-mount"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(JSON.parse(localStorage.getItem(CURRENT_KEY)!).furniture.some((item: { kind: string }) => item.kind === 'television')).toBe(false);
    fireEvent.click(container.querySelector('.catalog-tv-stand')!);
    expect(screen.queryByRole('checkbox', { name: 'Wall-mounted' })).not.toBeInTheDocument();
  });

  it('uses wall brackets even for older TV files with a legacy mounting flag', () => {
    for (const wallMounted of [false, true]) {
      const item = furniture({ kind: 'television', width: 100, depth: 25, wallMounted });
      const views = [render(<svg><FurnitureShape item={item} /></svg>),
        render(<IsoCanvas project={{ ...emptyProject(), furniture: [item] }} />)];
      for (const view of views) {
        expect(view.container.querySelector('[data-furniture-part="wall-mount"]')).toBeInTheDocument();
        expect(view.container.querySelector('[data-furniture-part="tv-feet"]')).not.toBeInTheDocument();
        view.unmount();
      }
    }
  });
  it('uses common names and excludes the retired choices from new rooms', () => {
    const labels = catalog.map(entry => entry.name);
    expect(labels).toEqual(expect.arrayContaining(['Office chair', 'Wall-mounted TV', 'Fridge', 'Washing machine', 'Bedside table', 'Drawers', 'Small table', 'Storage box', 'Floor lamp']));
    for (const retired of ['Ottoman', 'Vanity', 'Nightstand', 'Dresser', 'Side table', 'Clothes rack']) expect(labels).not.toContain(retired);
  });

  it('gives every catalog type its own recognisable icon', () => {
    const silhouettes = new Set<string>();
    for (const entry of catalog) {
      const Icon = furnitureIcons[entry.kind];
      const icon = render(<Icon />);
      const svg = icon.container.querySelector('svg')!;
      expect(svg).toHaveAttribute('data-furniture-icon', entry.kind);
      silhouettes.add(svg.innerHTML);
      icon.unmount();
    }
    expect(silhouettes.size).toBe(catalog.length);
  });

  it('draws clear appliance and lamp details in both views', () => {
    for (const [kind, detail] of [['fridge', 'fridge-door'], ['washing-machine', 'drum'], ['office-chair', 'wheels'], ['floor-lamp', 'lamp-shade']] as const) {
      const entry = catalog.find(item => item.kind === kind)!;
      const item = furniture({ ...entry });
      const flat = render(<svg><FurnitureShape item={item} /></svg>);
      expect(flat.container.querySelector(`[data-furniture-part="${detail}"]`)).toBeInTheDocument();
      flat.unmount();
      const iso = render(<IsoCanvas project={{ ...emptyProject(), furniture: [item] }} />);
      expect(iso.container.querySelector(`[data-furniture-part="${kind === 'fridge' ? 'fridge-doors' : detail}"]`)).toBeInTheDocument();
      iso.unmount();
    }
  });
  it.each(catalog)('draws $name at minimum and maximum dimensions in 2D and both 3D rotations', entry => {
    for (const size of [20, 400]) {
      const item = furniture({ ...entry, width: size, depth: size });
      const flat = render(<svg><FurnitureShape item={item} /></svg>);
      expect(flat.container.innerHTML).not.toMatch(/NaN|Infinity/);
      for (const rect of flat.container.querySelectorAll('rect')) {
        expect(Number(rect.getAttribute('width'))).toBeGreaterThanOrEqual(0);
        expect(Number(rect.getAttribute('height'))).toBeGreaterThanOrEqual(0);
      }
      flat.unmount();
      for (const rotated of [false, true]) {
        const iso = render(<IsoCanvas project={{ ...emptyProject(), furniture: [{ ...item, rotated }] }} />);
        expect(iso.container.querySelector('[data-furniture]')).toBeInTheDocument();
        expect(iso.container.innerHTML).not.toMatch(/NaN|Infinity/);
        iso.unmount();
      }
    }
  });

  it('distinguishes a double bed with two pillows and a bunk bed with a ladder and two levels', () => {
    const source = emptyProject();
    source.furniture = ['double-bed', 'bunk-bed'].map(kind => {
      const entry = catalog.find(item => item.kind === kind)!;
      return furniture({ ...entry, id: entry.kind });
    });
    const flat = render(<svg>{source.furniture.map(item => <FurnitureShape key={item.id} item={item} />)}</svg>);
    expect(flat.container.querySelector('[data-bed-part="double-pillows"]')).toBeInTheDocument();
    expect(flat.container.querySelector('[data-bed-part="ladder"]')).toBeInTheDocument();
    flat.unmount(); const iso = render(<IsoCanvas project={source} />);
    expect(iso.container.querySelectorAll('[data-shape="iso-bunk-bed"] [data-bed-part="mattress"]')).toHaveLength(2);
  });

  it.each(['ru', 'tr'] as const)('translates every generated furniture name in %s', language => {
    for (const entry of catalog) {
      const label = furnitureLabels[entry.kind];
      expect(translate(label, language)).not.toBe(label);
      expect(translate(`${label} 2`, language)).toBe(`${translate(label, language)} 2`);
    }
  });

  it('searches quantities without dropping hidden selections or custom measurements', () => {
    const onGenerate = vi.fn();
    render(<RoomSetup project={emptyProject()} busy={false} aiOptions={{ enabled: false, prompt: '' }} onAiOptionsChange={vi.fn()} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofa' } });
    fireEvent.change(screen.getByLabelText('Sofa count', { exact: true }), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Sofa width', { exact: true }), { target: { value: '180' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bedside' } });
    fireEvent.change(screen.getByLabelText('Bedside table count', { exact: true }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));
    const requests = onGenerate.mock.calls[0][1];
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'sofa', count: 1, width: 180 }),
      expect.objectContaining({ kind: 'nightstand', count: 2 }),
    ]));
  });

  it('searches the editor in Turkish and adds the selected new type with default dimensions', () => {
    setLanguage('tr'); const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Örnek oda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Örneği aç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eşyalara göz at' }));
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'sehpa' } });
    expect(container.querySelectorAll('.catalog-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Sehpa/ }));
    const source = JSON.parse(localStorage.getItem(CURRENT_KEY)!);
    expect(source.furniture.at(-1)).toMatchObject({ kind: 'coffee-table', width: 100, depth: 55 });
    fireEvent.change(search, { target: { value: 'nonexistent furniture' } });
    expect(screen.getByText(translate('No furniture matches your search.', getLanguage()))).toBeVisible();
  });
});
