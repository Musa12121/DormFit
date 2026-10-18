import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import RoomSetup from '../../src/components/RoomSetup';
import { emptyProject } from '../../src/domain/setup';
import type { FurnitureRequest } from '../../src/domain/setup';
import type { Room } from '../../src/domain/model';

function setup(overrides: Partial<ComponentProps<typeof RoomSetup>> = {}) {
  const onGenerate = vi.fn<(room: Room, requests: FurnitureRequest[]) => void>();
  render(<RoomSetup project={emptyProject()} busy={false} aiOptions={{ enabled: false, prompt: '' }}
    onAiOptionsChange={vi.fn()} onGenerate={onGenerate} {...overrides} />);
  return { onGenerate, next: () => fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' })) };
}
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));

it('accepts a 100 metre room and passes its dimensions in centimetres', () => {
  const { next, onGenerate } = setup();
  change('Room width', '100'); change('Room length', '80'); next();
  change('Bed count', '1'); submit();
  expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ width: 10_000, depth: 8000 }), expect.any(Array));
});

describe('room dimensions and furniture setup', () => {
  it('names the wall TV clearly and includes mounting automatically without a checkbox', () => {
    const { next, onGenerate } = setup(); next();
    expect(screen.queryByRole('checkbox', { name: 'Wall-mounted' })).not.toBeInTheDocument();
    change('Wall-mounted TV count', '1');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'desk' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'TV' } });
    expect(screen.queryByRole('checkbox', { name: 'Wall-mounted' })).not.toBeInTheDocument();
    change('TV stand count', '1'); submit();
    const requests = onGenerate.mock.calls[0][1];
    expect(requests.find(request => request.kind === 'television')).toMatchObject({ count: 1, wallMounted: true });
    expect(requests.find(request => request.kind === 'tv-stand')).not.toHaveProperty('wallMounted');
  });
  it('starts with room dimensions instead of the editor', () => {
    setup();
    expect(screen.getByLabelText('Room width', { exact: true })).toHaveValue(4.2);
    expect(screen.getByLabelText('Room length', { exact: true })).toHaveValue(3.6);
    expect(screen.getByLabelText('Room height', { exact: true })).toHaveValue(null);
    expect(screen.queryByText('Back to layout')).not.toBeInTheDocument();
  });
  it('invalid width cannot advance the native form', () => {
    const { next } = setup(); change('Room width', '1'); next();
    expect(screen.queryByLabelText('Bed count')).not.toBeInTheDocument();
  });
  it('converts metres to centimetres and includes custom furniture sizes', () => {
    const { next, onGenerate } = setup();
    change('Room width', '4.75'); change('Room length', '3.25'); change('Room height', '2.7'); next();
    change('Bed count', '2'); change('Wardrobe count', '3'); change('Bed width', '90'); change('Bed length', '190'); submit();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const [room, requests] = onGenerate.mock.calls[0];
    expect(room).toMatchObject({ width: 475, depth: 325, height: 270 });
    expect(requests.find((request) => request.kind === 'bed')).toMatchObject({ count: 2, width: 90, depth: 190 });
    expect(requests.find((request) => request.kind === 'wardrobe')?.count).toBe(3);
  });
  it('omits optional height when it was left empty', () => {
    const { next, onGenerate } = setup(); next(); change('Bed count', '1'); submit();
    expect(onGenerate.mock.calls[0][0]).not.toHaveProperty('height');
  });
  it('allows removing a previously saved optional height', () => {
    const saved = emptyProject(); saved.room.height = 270;
    const { next, onGenerate } = setup({ project: saved });
    change('Room height', ''); next(); change('Bed count', '1'); submit();
    expect(onGenerate.mock.calls[0][0]).not.toHaveProperty('height');
  });
  it('cannot generate an empty furniture list', () => {
    const { next, onGenerate } = setup(); next(); submit();
    expect(screen.getByRole('button', { name: 'Show layouts' })).toBeDisabled();
    expect(onGenerate).not.toHaveBeenCalled();
  });
  it('quantity buttons add and remove furniture without going negative', () => {
    const { next } = setup(); next();
    expect(screen.getByRole('button', { name: 'Bed decrease count' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Bed increase count' }));
    expect(screen.getByLabelText('Bed count')).toHaveValue(1);
    fireEvent.click(screen.getByRole('button', { name: 'Bed decrease count' }));
    expect(screen.getByLabelText('Bed count')).toHaveValue(0);
  });
  it.each(['-1', '1.5', '11'])('rejects invalid furniture count %s', (value) => {
    const { next, onGenerate } = setup(); next(); change('Bed count', value); submit();
    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Bed count')).toHaveValue(0);
  });
  it('stops adding a type at ten pieces', () => {
    const { next } = setup(); next(); change('Bed count', '10');
    expect(screen.getByRole('button', { name: 'Bed increase count' })).toBeDisabled();
  });
  it('disables all add buttons at 30 pieces', () => {
    const { next } = setup(); next();
    change('Bed count', '10'); change('Desk count', '10'); change('Wardrobe count', '10');
    expect(screen.getByRole('button', { name: 'Plant increase count' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show layouts' })).toBeEnabled();
  });
  it('direct typing above the total limit shows a warning and blocks generation', () => {
    const { next, onGenerate } = setup(); next();
    change('Bed count', '10'); change('Desk count', '10'); change('Wardrobe count', '10'); change('Plant count', '1');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose up to 30 furniture items'); submit();
    expect(onGenerate).not.toHaveBeenCalled();
  });
  it('only asks dimensions for selected furniture types', () => {
    const { next } = setup(); next();
    expect(screen.queryByLabelText('Wardrobe width')).not.toBeInTheDocument();
    change('Wardrobe count', '1');
    expect(screen.getByLabelText('Wardrobe width')).toHaveValue(80);
  });
  it('preserves dimensions and counts when returning to the first step', () => {
    const { next } = setup(); change('Room width', '5'); next(); change('Bed count', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Back to dimensions' }));
    expect(screen.getByLabelText('Room width')).toHaveValue(5); next();
    expect(screen.getByLabelText('Bed count')).toHaveValue(2);
  });
  it('blocks duplicate submission while a plan is being generated', () => {
    const saved = emptyProject(); saved.furniture = [{ id: 'bed-1', kind: 'bed', name: 'Bed 1', owner: 'a', width: 100, depth: 200, x: 10, y: 10, rotated: false }];
    const { next } = setup({ project: saved, busy: true }); next();
    expect(screen.getByRole('button', { name: 'Creating layouts…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to dimensions' })).toBeDisabled();
  });
});
