import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../../src/App';
import { CURRENT_KEY } from '../../src/domain/storage';
import { AI_PROTOCOL } from '../../src/domain/ai';
import { aiPlan } from './fixtures';

function begin() {
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
  return view;
}
function count(name: string, value: number) {
  fireEvent.change(screen.getByLabelText(`${name} count`, { exact: true }), { target: { value: String(value) } });
}
const stored = () => JSON.parse(localStorage.getItem(CURRENT_KEY)!);
const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));

describe('application workflow', () => {
  it('removes unfitted chairs from the active canvas and persists the reported count', async () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText('Room width', { exact: true }), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Room length', { exact: true }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    count('Chair', 10); generate();
    await waitFor(() => expect(stored().omittedChairs?.length).toBeGreaterThan(0), { timeout: 10_000 });
    const current = stored();
    expect(current.furniture.length + current.omittedChairs.length).toBe(10);
    expect(container.querySelector('.inventory-overview .chair-omissions')).toHaveTextContent(`Left out: ${current.omittedChairs.length}.`);
    for (const chair of current.omittedChairs) expect(container.querySelector(`.canvas-panel [data-furniture="${chair.id}"]`)).toBeNull();
  }, 15_000);
  it('shows explicitly omitted AI chairs without restoring them to the canvas', async () => {
    const response = { positions: [{ id: 'plant-1', x: 0, y: 0, rotation: 0 }, { id: 'chair-1', x: 100, y: 100, rotation: 0 }],
      omittedChairIds: ['chair-2'], requirements: [], unmetRequests: [], explanation: 'A practical partial layout.', tips: [] };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(response, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } })));
    const { container } = begin(); count('Plant', 1); count('Chair', 2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' })); generate();
    await waitFor(() => expect(container.querySelector('[data-layout-id="ai"]')).toBeInTheDocument());
    expect(stored().furniture).toHaveLength(2);
    expect(stored().omittedChairs).toHaveLength(1);
    expect(container.querySelector('.inventory-overview .chair-omissions')).toHaveTextContent('Chairs placed: 1 of 2. Left out: 1.');
    expect(container.querySelector('.canvas-panel [data-furniture="chair-2"]')).toBeNull();
  });
  it('opens a fresh workspace with dimensions and no preloaded example furniture', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'What size is your room?' })).toBeVisible();
    expect(stored().furniture).toHaveLength(0);
  });
  it('opens example furniture only after the explicit confirmation action', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Example room' }));
    expect(stored().furniture).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open example' }));
    expect(stored().furniture).toHaveLength(6);
    expect(container.querySelector('.canvas-panel [data-shape="wardrobe"]')).toBeInTheDocument();
  });
  it('creates exactly the selected items and renders the new wardrobe drawing', async () => {
    const { container } = begin(); count('Bed', 1); count('Wardrobe', 2); generate();
    await waitFor(() => expect(container.querySelectorAll('.layout-card')).toHaveLength(3));
    await waitFor(() => expect(stored().furniture).toHaveLength(3));
    expect(stored().furniture.filter((item: { kind: string }) => item.kind === 'wardrobe')).toHaveLength(2);
    expect(container.querySelectorAll('.canvas-panel [data-shape="wardrobe"]')).toHaveLength(2);
  });
  it('never calls the backend with AI disabled', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { container } = begin(); count('Bed', 1); generate();
    await waitFor(() => expect(container.querySelectorAll('.layout-card')).toHaveLength(3));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['', '   '])('creates and regenerates an AI layout without a note (%j), skipping preference review', async prompt => {
    const plan = {
      positions: [{ id: 'bed-1', x: 10, y: 100, rotated: false }],
      requirements: [], unmetRequests: [], explanation: 'A layout based on the room and furniture.', tips: [],
    };
    const fetch = vi.fn().mockImplementation(async () => Response.json(plan, {
      headers: { 'X-DormFit-AI-Version': AI_PROTOCOL },
    }));
    vi.stubGlobal('fetch', fetch);
    const { container } = begin(); count('Bed', 1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' }));
    fireEvent.change(screen.getByLabelText('Your room preferences'), { target: { value: prompt } });
    generate();
    await waitFor(() => expect(container.querySelector('[data-layout-id="ai"]')).toBeInTheDocument());
    expect(container.querySelectorAll('.layout-card')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Confirm & create layout' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/layout-advice');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ prompt, project: { furniture: [{ id: 'bed-1' }] } });
    await waitFor(() => expect(stored().furniture[0]).toMatchObject({ x: 10, y: 100 }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate layouts' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector('.ai-success')).toBeInTheDocument());
    expect(fetch.mock.calls.every(call => call[0] === '/api/layout-advice')).toBe(true);
  });
  it('supports a keyboard edit and undo after generating a layout', async () => {
    const { container } = begin(); count('Bed', 1); generate();
    await waitFor(() => expect(stored().furniture.length).toBeGreaterThan(0));
    const before = stored().furniture[0].x;
    const bed = container.querySelector('.canvas-panel [data-furniture="bed-1"]')!;
    fireEvent.focus(bed); fireEvent.keyDown(bed, { key: 'ArrowRight' });
    expect(stored().furniture[0].x).toBe(before + 5);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stored().furniture[0].x).toBe(before);
    expect(container.querySelectorAll('.layout-card')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(stored().furniture[0].x).toBe(before + 5);
  });
  it('keeps suggestions and selection when undoing and redoing layout choices', async () => {
    const { container } = begin(); count('Bed', 1); generate();
    await waitFor(() => expect(container.querySelectorAll('.layout-card')).toHaveLength(3));
    const first = container.querySelector('.layout-card[aria-pressed="true"]')!.getAttribute('data-layout-id');
    const second = [...container.querySelectorAll<HTMLButtonElement>('.layout-card')].find(card => card.getAttribute('data-layout-id') !== first)!;
    const secondId = second.getAttribute('data-layout-id');
    fireEvent.click(second);
    const secondRoom = structuredClone(stored());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(container.querySelectorAll('.layout-card')).toHaveLength(3);
    expect(container.querySelector('.layout-card[aria-pressed="true"]')).toHaveAttribute('data-layout-id', first);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(container.querySelectorAll('.layout-card')).toHaveLength(3);
    expect(container.querySelector('.layout-card[aria-pressed="true"]')).toHaveAttribute('data-layout-id', secondId);
    expect(stored()).toEqual(secondRoom);
  });
  it('keeps the AI card available when undo returns to a regular layout', async () => {
    const plan = { positions: [{ id: 'bed-1', x: 10, y: 100, rotation: 0 }],
      requirements: [], unmetRequests: [], explanation: 'An AI proposal.', tips: [] };
    const fetch = vi.fn().mockResolvedValue(Response.json(plan, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } }));
    vi.stubGlobal('fetch', fetch);
    const { container } = begin(); count('Bed', 1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' })); generate();
    await waitFor(() => expect(container.querySelector('.ai-success')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(container.querySelectorAll('.layout-card')).toHaveLength(4);
    expect(container.querySelector('[data-layout-id="ai"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(container.querySelectorAll('.layout-card')).toHaveLength(4);
    expect(container.querySelector('[data-layout-id="ai"]')).toHaveAttribute('aria-pressed', 'true');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses real returned coordinates and clears stale AI claims after a manual edit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(aiPlan(), {
      headers: { 'X-DormFit-AI-Version': AI_PROTOCOL },
    })));
    const { container } = begin(); count('Bed', 1); count('Plant', 1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' }));
    fireEvent.change(screen.getByLabelText('Your room preferences'), { target: { value: 'Place the plant near the window.' } }); generate();
    await waitFor(() => expect(screen.getByLabelText('Condition 1 target')).toHaveValue('window'));
    expect(container.querySelector('.canvas-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & create layout' }));
    await waitFor(() => expect(container.querySelectorAll('.layout-card')).toHaveLength(4));
    await waitFor(() => expect(stored().furniture.find((item: { id: string }) => item.id === 'plant-1')?.y).toBe(10));
    const bed = container.querySelector('.canvas-panel [data-furniture="bed-1"]')!;
    fireEvent.focus(bed); fireEvent.keyDown(bed, { key: 'ArrowRight' });
    expect(container.querySelector('.ai-success')).not.toBeInTheDocument();
  });
  it('keeps local plans available when Gemini returns a quota error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'The request limit has been reached.', code: 'GEMINI_QUOTA' }, { status: 429 })));
    const { container } = begin(); count('Bed', 1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' })); generate();
    await waitFor(() => expect(container.querySelector('.ai-fallback')).toBeInTheDocument());
    expect(container.querySelectorAll('.layout-card')).toHaveLength(3);
    expect(container.querySelector('.ai-fallback')).toHaveTextContent('GEMINI_QUOTA');
    expect(stored().furniture).toHaveLength(1);
  });
  it('shows selected dimensions on the left and supports resizing with undo', async () => {
    const { container } = begin(); count('Bed', 1); generate();
    await waitFor(() => expect(stored().furniture.length).toBeGreaterThan(0));
    fireEvent.focus(container.querySelector('.canvas-panel [data-furniture="bed-1"]')!);
    const editor = screen.getByRole('region', { name: 'Selected furniture' });
    expect(container.querySelector('.left-panel')).toContainElement(editor);
    const field = within(editor).getByLabelText('Furniture width');
    expect(field).toHaveValue('100');
    fireEvent.change(field, { target: { value: '120' } }); fireEvent.blur(field);
    expect(stored().furniture[0].width).toBe(120);
    expect(container.querySelector('.canvas-panel [data-furniture="bed-1"]')).toHaveTextContent('120');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stored().furniture[0].width).toBe(100);
  });
  it('rejects invalid sizes without changing the plan', async () => {
    const { container } = begin(); count('Bed', 1); generate();
    await waitFor(() => expect(stored().furniture.length).toBeGreaterThan(0));
    fireEvent.focus(container.querySelector('.canvas-panel [data-furniture="bed-1"]')!);
    const field = screen.getByLabelText('Furniture width');
    fireEvent.change(field, { target: { value: '0' } }); fireEvent.blur(field);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(stored().furniture[0].width).toBe(100);
  });
  it('selects furniture from 3D and opens the same left editor', async () => {
    begin(); count('Bed', 1); generate();
    await waitFor(() => expect(stored().furniture.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Bed 1' }));
    expect(screen.getByRole('region', { name: 'Selected furniture' })).toBeVisible();
    expect(screen.getByLabelText('Furniture length')).toHaveValue('200');
  });
  it('resets unfinished size edits when a different item is selected', async () => {
    const { container } = begin(); count('Bed', 2); generate();
    await waitFor(() => expect(stored().furniture.length).toBeGreaterThan(0));
    fireEvent.focus(container.querySelector('.canvas-panel [data-furniture="bed-1"]')!);
    fireEvent.change(screen.getByLabelText('Furniture width'), { target: { value: '999' } });
    fireEvent.focus(container.querySelector('.canvas-panel [data-furniture="bed-2"]')!);
    expect(screen.getByLabelText('Furniture width')).toHaveValue('100');
  });
});
