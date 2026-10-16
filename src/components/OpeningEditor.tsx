import { t } from '../i18n';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Room, RoomOpening } from '../domain/model';
import { getOpenings, MAX_OPENINGS, openingLabel, openingsProblem, wallLength, walls } from '../domain/openings';
import NumberField from './NumberField';

export default function OpeningEditor({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const [error, setError] = useState('');
  const openings = getOpenings(room);
  function commit(next: RoomOpening[]) {
    const updated = { ...room, openings: next };
    const problem = openingsProblem(updated);
    if (problem) { setError(problem); return; }
    setError('');
    onChange(updated);
  }
  function change(id: string, patch: Partial<RoomOpening>) {
    commit(openings.map((opening) => {
      if (opening.id !== id) return opening;
      const next = { ...opening, ...patch };
      next.width = Math.min(next.width, wallLength(room, next.wall));
      next.offset = Math.min(next.offset, wallLength(room, next.wall) - next.width);
      return next;
    }));
  }
  function add(kind: RoomOpening['kind']) {
    const width = kind === 'door' ? 85 : 120;
    for (const wall of walls) {
      const sameWall = openings.filter((opening) => opening.wall === wall).sort((a, b) => a.offset - b.offset);
      const offsets = [0, ...sameWall.map((opening) => opening.offset + opening.width + 10)];
      for (const offset of offsets) {
        const opening = { id: `opening-${crypto.randomUUID()}`, kind, wall, offset, width };
        if (!openingsProblem({ ...room, openings: [...openings, opening] })) {
          commit([...openings, opening]); return;
        }
      }
    }
    setError('No wall space is available. Move or remove another opening first.');
  }
  return <section className="opening-editor" aria-label={t("Doors and windows")}>
    <div className="section-label"><h3>{t("Doors and windows")}</h3><span>{openings.length}/{MAX_OPENINGS}</span></div>
    <p className="small-muted">{t("Drag doors and windows on the room plan to move them. They snap to walls. Use arrow keys to move a focused opening, or R to change its wall.")}</p>
    <div className="opening-list">
      {openings.map((opening) => {
        const label = openingLabel(room, opening);
        return <fieldset key={opening.id} className="opening-card" data-opening-editor={opening.id}>
          <legend>{t(label)}</legend>
          <div className="opening-heading">
            <span className="opening-position" aria-label={t(`${label} position`)}>{t(`${opening.wall[0].toUpperCase() + opening.wall.slice(1)} wall`)}</span>
            <button type="button" className="icon-button danger" aria-label={t(`Remove ${label}`)} onClick={() => commit(openings.filter((item) => item.id !== opening.id))}><Trash2 size={15} /></button>
          </div>
          <div className="field-row">
            <NumberField label={t(`${label} width`)} value={opening.width} min={60}
              max={opening.kind === 'door' ? Math.min(140, room.width, room.depth) : wallLength(room, opening.wall)}
              onChange={(width) => change(opening.id, { width: Math.round(width) })} />
            <NumberField label={t(`${label} offset`)} value={opening.offset} min={0} max={wallLength(room, opening.wall) - opening.width}
              onChange={(offset) => change(opening.id, { offset: Math.round(offset) })} />
          </div>
        </fieldset>;
      })}
    </div>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    <div className="opening-actions">
      <button type="button" className="button secondary" disabled={openings.length >= MAX_OPENINGS} onClick={() => add('window')}><Plus size={14} />{t("Add window")}</button>
      <button type="button" className="button secondary" disabled={openings.length >= MAX_OPENINGS} onClick={() => add('door')}><Plus size={14} />{t("Add door")}</button>
    </div>
  </section>;
}
