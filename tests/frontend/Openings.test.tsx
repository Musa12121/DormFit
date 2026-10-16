import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { defaultProject } from '../../src/domain/model';
import type { Room } from '../../src/domain/model';
import { getOpenings } from '../../src/domain/openings';
import OpeningEditor from '../../src/components/OpeningEditor';
import PlanCanvas from '../../src/components/PlanCanvas';
import IsoCanvas from '../../src/components/IsoCanvas';

function Editor() {
  const [room, setRoom] = useState<Room>(defaultProject().room);
  return <><OpeningEditor room={room} onChange={setRoom} /><PlanCanvas project={{ ...defaultProject(), room, furniture: [] }} onRoomChange={setRoom} /><output data-testid="room">{JSON.stringify(room)}</output></>;
}
const change = (label: string, value: string) => {
  const field = screen.getByLabelText(label); fireEvent.change(field, { target: { value } }); fireEvent.blur(field);
};
const room = () => JSON.parse(screen.getByTestId('room').textContent!) as Room;

describe('room openings', () => {
  it('moves an opening to a chosen wall and offset', () => {
    render(<Editor />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Move Window 1,/ }), { key: 'r' });
    change('Window 1 offset', '80'); change('Window 1 width', '100');
    expect(getOpenings(room()).find((opening) => opening.kind === 'window')).toMatchObject({ wall: 'right', offset: 80, width: 100 });
  });
  it('adds multiple windows and doors and removes a selected opening', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Add window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add door' }));
    expect(getOpenings(room())).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Window 1' }));
    expect(getOpenings(room()).filter((opening) => opening.kind === 'window')).toHaveLength(1);
  });
  it('rejects overlapping openings while preserving the previous valid geometry', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Add window' }));
    change('Window 2 offset', '140');
    expect(screen.getByRole('alert')).toHaveTextContent('must not overlap');
    expect(getOpenings(room()).find((opening) => opening.kind === 'window')?.wall).toBe('top');
  });
  it('uses direct manipulation instead of a wall dropdown', () => {
    render(<Editor />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const window = screen.getByRole('button', { name: /^Move Window 1,/ });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(getOpenings(room()).find((opening) => opening.kind === 'window')?.offset).toBe(140);
  });
  it('rejects an out-of-wall offset and an invalid width', () => {
    render(<Editor />);
    change('Window 1 offset', '999'); change('Door 1 width', '20');
    expect(screen.getByLabelText('Window 1 offset')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Door 1 width')).toHaveAttribute('aria-invalid', 'true');
    expect(room().openings).toBeUndefined();
  });
  it('allows a room without windows or doors', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Window 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Door 1' }));
    expect(getOpenings(room())).toEqual([]);
  });
  it('renders actual opening walls in 2D and 3D', () => {
    const project = defaultProject(); project.room.openings = [
      { id: 'opening-side', kind: 'window', wall: 'right', offset: 80, width: 120 },
      { id: 'opening-entry', kind: 'door', wall: 'left', offset: 200, width: 80 },
    ];
    const { container } = render(<><PlanCanvas project={project} /><IsoCanvas project={project} /></>);
    expect(container.querySelectorAll('[data-opening="opening-side"][data-wall="right"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-opening="opening-entry"][data-wall="left"]')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Window 1, right wall, 120 cm wide, offset 80 cm' })).toBeInTheDocument();
  });
});
