import { getLanguage, locales, t } from '../i18n';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Minus,
  Plus,
  Ruler,
  Square,
} from 'lucide-react';
import type { FurnitureKind, Project, Room } from '../domain/model';
import { furnitureLabels as names, supportedFurniture } from '../domain/model';
import { furnitureIcons as icons } from './furnitureIcons';
import { getFurnitureRequests, MAX_FURNITURE, MAX_PER_KIND } from '../domain/setup';
import type { FurnitureRequest } from '../domain/setup';
import type { AiOptions } from '../domain/ai';
import AiControls from './AiControls';
import OpeningEditor from './OpeningEditor';
import PlanCanvas from './PlanCanvas';
import { fitOpenings, openingsProblem } from '../domain/openings';
import { MAX_ROOM_METRES } from '../domain/limits';
import { clearValidation, showValidation } from './formValidation';
import FurnitureSearch, { matchesFurniture } from './FurnitureSearch';


interface Props {
  project: Project;
  busy: boolean;
  aiOptions: AiOptions;
  onAiOptionsChange: (options: AiOptions) => void;
  onGenerate: (room: Room, requests: FurnitureRequest[]) => void;
}

export default function RoomSetup({ project, busy, aiOptions, onAiOptionsChange, onGenerate }: Props) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [width, setWidth] = useState(String(project.room.width / 100));
  const [length, setLength] = useState(String(project.room.depth / 100));
  const [height, setHeight] = useState(
    project.room.height ? String(project.room.height / 100) : '',
  );
  const [choices, setChoices] = useState(() =>
    getFurnitureRequests(project).map((request) => ({
      ...request,
      width: String(request.width),
      depth: String(request.depth),
    })),
  );
  const [openingRoom, setOpeningRoom] = useState(project.room);
  const previewWidth = Math.max(200, Math.min(10_000, Math.round(Number(width) * 100) || 200));
  const previewDepth = Math.max(200, Math.min(10_000, Math.round(Number(length) * 100) || 200));
  const measuredRoom = fitOpenings({ ...openingRoom, width: previewWidth, depth: previewDepth, window: Math.min(openingRoom.window, previewWidth - 20) });
  const openingError = openingsProblem(measuredRoom);
  const total = choices.reduce((sum, choice) => sum + choice.count, 0);
  const area = Number(width) * Number(length);

  function changeCount(kind: FurnitureKind, count: number) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_PER_KIND) return;
    setChoices((current) =>
      current.map((choice) => (choice.kind === kind ? { ...choice, count } : choice)),
    );
  }

  function changeSize(kind: FurnitureKind, field: 'width' | 'depth', value: string) {
    setChoices((current) =>
      current.map((choice) => (choice.kind === kind ? { ...choice, [field]: value } : choice)),
    );
  }

  function submit() {
    const room: Room = {
      ...measuredRoom,
      width: Math.round(Number(width) * 100),
      depth: Math.round(Number(length) * 100),
      door: measuredRoom.door,
      window: measuredRoom.window,
    };
    delete room.height;
    if (height !== '') room.height = Math.round(Number(height) * 100);
    const requests = choices.map((choice) => ({
      kind: choice.kind,
      count: choice.count,
      width: Math.round(Number(choice.width)),
      depth: Math.round(Number(choice.depth)),
    }));
    onGenerate(room, requests);
  }

  return (
    <section className="setup" aria-label={t("New room layout")}>
      <ol className="workflow-steps" aria-label={t("Planning steps")}>
        <li
          className={step === 1 ? 'current' : 'complete'}
          aria-current={step === 1 ? 'step' : undefined}
        >
          <span>{t(step > 1 ? <Check size={14} /> : '01')}</span>{t("Room dimensions")}</li>
        <li className={step === 2 ? 'current' : ''} aria-current={step === 2 ? 'step' : undefined}>
          <span>02</span>{t("Furniture quantities")}</li>
        <li>
          <span>03</span>{t("Layout suggestions")}</li>
      </ol>

      {step === 1 ? (
        <form
          className="setup-room panel"
          onInvalid={showValidation} onInput={clearValidation}
          onSubmit={(event) => {
            event.preventDefault();
            if (!openingError) setStep(2);
          }}
        >
          <div className="setup-form">
            <span className="eyebrow">{t("STEP 01 / 03")}</span>
            <h2>{t("What size is your room?")}</h2>
            <p>{t("Enter the width and length. We will use these to create your layouts.")}</p>
            <div className="setup-dimensions">
              <label className="setup-input">{t("Room width")}<div>
                  <input
                    name="width"
                    aria-label={t("Room width")}
                    type="number"
                    min="2"
                    max={MAX_ROOM_METRES}
                    step="0.01"
                    required
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                  />
                  <span>{t("m")}</span>
                </div>
              </label>
              <label className="setup-input">{t("Room length")}<div>
                  <input
                    name="length"
                    aria-label={t("Room length")}
                    type="number"
                    min="2"
                    max={MAX_ROOM_METRES}
                    step="0.01"
                    required
                    value={length}
                    onChange={(event) => setLength(event.target.value)}
                  />
                  <span>{t("m")}</span>
                </div>
              </label>
              <label className="setup-input optional-height">{t("Height ")}<small>{t("optional")}</small>
                <div>
                  <input
                    name="height"
                    aria-label={t("Room height")}
                    type="number"
                    min="1.8"
                    max="6"
                    step="0.01"
                    placeholder={t("For example, 2.7")}
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                  <span>{t("m")}</span>
                </div>
              </label>
            </div>
            <p className="setup-hint">
              <Ruler size={14} />{t("Measure wall to wall. Height does not change the floor layout.")}</p>
            <OpeningEditor room={measuredRoom} onChange={setOpeningRoom} />
            {openingError && <p role="alert" className="form-error">{t(openingError)}</p>}
            <div className="setup-buttons">
              <button type="submit" className="button primary" disabled={Boolean(openingError)}>{t("Next: furniture")}<ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="setup-room-preview">
            <span className="preview-kicker">{t("DRAG DOORS AND WINDOWS TO POSITION THEM")}</span>
            <PlanCanvas project={{ ...project, room: measuredRoom, furniture: [] }} mini onRoomChange={setOpeningRoom} />
            <strong className="setup-area">{t(Number.isFinite(area) && area > 0 ? area.toLocaleString(locales[getLanguage()], { maximumFractionDigits: 2 }) : '—')}{t(" m²")}</strong>
            <p>{t("One room. Many possibilities.")}</p>
            <span>{t("Start with the space, then make it yours.")}</span>
          </div>
        </form>
      ) : (
        <form
          className="setup-inventory"
          onInvalid={showValidation} onInput={clearValidation}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="inventory-main panel">
            <div className="inventory-heading">
              <div>
                <span className="eyebrow">{t("STEP 02 / 03")}</span>
                <h2>{t("What would you like in your room?")}</h2>
                <p>{t("Choose how many of each furniture item you have or want.")}</p>
              </div>
              <span className="room-size-badge">
                <Square size={14} />
                {t(width)} × {t(length)}{t(" m")}</span>
            </div>
            <FurnitureSearch value={search} onChange={setSearch} />
            {!choices.some(choice => matchesFurniture(choice.kind, search)) && <p className="small-muted" role="status">{t('No furniture matches your search.')}</p>}
            <div className="quantity-grid">
              {choices.filter(choice => matchesFurniture(choice.kind, search)).map((choice) => {
                const Icon = icons[choice.kind];
                const entry = supportedFurniture.find(item => item.kind === choice.kind);
                return (
                  <article
                    key={choice.kind}
                    className={`quantity-card ${choice.count > 0 ? 'has-quantity' : ''}`}
                    data-kind={choice.kind}
                  >
                    <div className="quantity-heading">
                      <span className={`quantity-icon catalog-${choice.kind}`}>
                        <Icon size={30} strokeWidth={1.6} />
                      </span>
                      <strong>{t(names[choice.kind])}</strong>
                      <div className="quantity-stepper">
                        <button
                          type="button"
                          aria-label={t(`${names[choice.kind]} decrease count`)}
                          disabled={choice.count === 0}
                          onClick={() => changeCount(choice.kind, choice.count - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          aria-label={t(`${names[choice.kind]} count`)}
                          type="number"
                          min="0"
                          max={MAX_PER_KIND}
                          step="1"
                          value={choice.count}
                          onChange={(event) => changeCount(choice.kind, Number(event.target.value))}
                        />
                        <button
                          type="button"
                          aria-label={t(`${names[choice.kind]} increase count`)}
                          disabled={choice.count === MAX_PER_KIND || total >= MAX_FURNITURE}
                          onClick={() => changeCount(choice.kind, choice.count + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    {entry?.hint && <p className="furniture-hint">{t(entry.hint)}</p>}
                    {choice.count > 0 ? (
                      <div className="quantity-dimensions">
                        <label>{t("Width")}<input
                            aria-label={t(`${names[choice.kind]} width`)}
                            type="number"
                            min="20"
                            max="400"
                            step="1"
                            required
                            value={choice.width}
                            onChange={(event) =>
                              changeSize(choice.kind, 'width', event.target.value)
                            }
                          />
                          <span>{t("cm")}</span>
                        </label>
                        <span>×</span>
                        <label>{t("Length")}<input
                            aria-label={t(`${names[choice.kind]} length`)}
                            type="number"
                            min="20"
                            max="400"
                            step="1"
                            required
                            value={choice.depth}
                            onChange={(event) =>
                              changeSize(choice.kind, 'depth', event.target.value)
                            }
                          />
                          <span>{t("cm")}</span>
                        </label>
                      </div>
                    ) : (
                      <p className="quantity-empty">{t("Increase the quantity to include this item.")}</p>
                    )}
                  </article>
                );
              })}
            </div>
            <AiControls options={aiOptions} disabled={busy} onChange={onAiOptionsChange} />
            <p className="inventory-note">{t("Sizes apply to one item. Items of the same type start with these sizes; you can resize each one separately in the layout.")}</p>
          </div>
          <aside className="inventory-summary panel">
            <span className="eyebrow">{t("YOUR SELECTION")}</span>
            <h3>
              {total}
              <span>{t(" furniture items")}</span>
            </h3>
            <div className="summary-list">
              {choices
                .filter((choice) => choice.count > 0)
                .map((choice) => (
                  <div key={choice.kind}>
                    <span>{t(names[choice.kind])}</span>
                    <strong>{t(`${choice.count} items`)}</strong>
                  </div>
                ))}
              {total === 0 && (
                <p>{t("Add your first item. Start with a bed, wardrobe or desk.")}</p>
              )}
            </div>
            <div className="summary-room">
              <Ruler size={15} />
              <span>
                {t(width)} × {t(length)}{t(" m")}{t(height ? ` · h ${height} m` : '')}
              </span>
            </div>
            {total > MAX_FURNITURE && (
              <p className="form-error" role="alert">{t("Choose up to ")}{MAX_FURNITURE}{t(" furniture items.")}</p>
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={busy || total === 0 || total > MAX_FURNITURE}
            >
              {t(busy ? 'Creating layouts…' : 'Show layouts')}
              <ArrowRight size={16} />
            </button>
            <button
              className="button ghost full"
              type="button"
              disabled={busy}
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={14} />{t("Back to dimensions")}</button>
            <p className="summary-caption">{t("We will try to fit all your furniture using these measurements.")}</p>
          </aside>
        </form>
      )}
    </section>
  );
}
