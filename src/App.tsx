import { applyDocumentLanguage, getLanguage, locales, setLanguage, subscribeLanguage, t } from './i18n';
import type { Language } from './i18n';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Armchair,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Expand,
  Shrink,
  FolderOpen,
  Grid2X2,
  Layers,
  Lightbulb,
  Minus,
  Moon,
  Sun,
  MousePointer2,
  Move,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
  TriangleAlert,
  LayoutGrid,
} from 'lucide-react';
import type {
  CatalogItem,
  Furniture,
  Owner,
  Project,
  SavedProject,
} from './domain/model';
import { catalog, cloneProject, defaultProject, furnitureLabels as labels } from './domain/model';
import { furnitureIcons as icons } from './components/furnitureIcons';
import { createProject, emptyProject, getFurnitureRequests } from './domain/setup';
import type { FurnitureRequest } from './domain/setup';
import type { Room } from './domain/model';
import RoomSetup from './components/RoomSetup';
import LayoutSuggestions from './components/LayoutSuggestions';
import {
  analyze,
  clampItem,

  footprint,
  generateLayouts,
  overlaps,
} from './domain/planner';
import type { LayoutOption } from './domain/planner';
import type { AiOptions, AiStatus } from './domain/ai';
import { requestAiPlan } from './domain/requestAiPlan';
import { CURRENT_KEY, SAVED_KEY, isProject, readCurrent, readSaved } from './domain/storage';
import { exportImage, exportProject } from './domain/export';
import PlanCanvas from './components/PlanCanvas';
import IsoCanvas from './components/IsoCanvas';
import NumberField from './components/NumberField';
import Modal from './components/Modal';
import { useFullscreen } from './components/useFullscreen';
import { useTheme } from './components/useTheme';
import { MAX_ROOM_METRES } from './domain/limits';
import { axisPositions } from './domain/positions';
import { doorZones, fitOpenings, openingsProblem } from './domain/openings';
import OpeningEditor from './components/OpeningEditor';
import PreferenceReviewModal from './components/PreferenceReviewModal';
import { requestPreferenceReview } from './domain/requestPreferenceReview';
import type { PreferenceReview } from './domain/ai';
import { clearValidation, showValidation } from './components/formValidation';
import FurnitureSearch, { matchesFurniture } from './components/FurnitureSearch';

type Dialog = 'help' | 'saved' | 'save' | 'reset' | null;

function format(n: number) {
  return n.toLocaleString(locales[getLanguage()], { maximumFractionDigits: 1 });
}

export default function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  useEffect(applyDocumentLanguage, [language]);
  const { theme, toggleTheme } = useTheme();
  const [project, setProject] = useState<Project>(() => readCurrent() ?? emptyProject());
  const ref = useRef(project);
  ref.current = project;
  const [setupOpen, setSetupOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'room' | 'furniture'>('room');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [view, setView] = useState<'2d' | 'iso'>('2d');
  const [grid, setGrid] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [zoom, setZoom] = useState(1);
  const { panelRef, isFullscreen, expandedFallback, toggleFullscreen } = useFullscreen();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState('');
  const [storageStatus, setStorageStatus] = useState<'saved' | 'error'>('saved');
  const [layouts, setLayouts] = useState<LayoutOption[]>([]);
  const [generating, setGenerating] = useState(false);
  const [aiOptions, setAiOptions] = useState<AiOptions>({ enabled: false, prompt: '' });
  const [preferenceReview, setPreferenceReview] = useState<{ project: Project; prompt: string; draft: PreferenceReview; error: string } | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>({ kind: 'idle' });
  const [activeLayout, setActiveLayout] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const dragOrigin = useRef<Project | null>(null);
  const [saved, setSaved] = useState<SavedProject[]>(readSaved);
  const [deleteTarget, setDeleteTarget] = useState<SavedProject | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [saveName, setSaveName] = useState(project.name);
  const [exportOpen, setExportOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationId = useRef(0);
  const aiRequest = useRef<AbortController | null>(null);
  const state = analyze(project);
  const item = project.furniture.find((f) => f.id === selected);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(project));
      setStorageStatus('saved');
    } catch {
      setStorageStatus('error');
    }
  }, [project]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (generationTimer.current) clearTimeout(generationTimer.current);
      aiRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [exportOpen]);

  function notify(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }
  function update(next: Project, record = true, keepLayouts = false) {
    if (!keepLayouts) {
      cancelGeneration();
      if (!dragOrigin.current) setAiStatus({ kind: 'idle' });
    }
    if (record) {
      const previous = cloneProject(ref.current);
      setUndoStack((s) => [...s.slice(-39), previous]);
      setRedoStack([]);
    }
    ref.current = next;
    setProject(next);
    // Keep the content above the canvas in place until the pointer is released.
    if (!keepLayouts && !dragOrigin.current) {
      setLayouts([]);
      setActiveLayout(null);
    }
  }
  function updateRoom(room: Room, record = true) {
    const next = fitOpenings(room);
    const problem = openingsProblem(next);
    if (problem) { notify(problem); return; }
    update({ ...ref.current, room: next }, record);
  }
  function patchItem(id: string, patch: Partial<Furniture>, record = true) {
    update(
      {
        ...ref.current,
        furniture: ref.current.furniture.map((f) => (f.id === id
          ? (patch.width !== undefined || patch.depth !== undefined
            ? clampItem({ ...f, ...patch }, ref.current.room)
            : { ...f, ...patch })
          : f)),
      },
      record,
    );
  }
  function startDrag() {
    cancelGeneration();
    dragOrigin.current = cloneProject(ref.current);
  }
  function endDrag() {
    if (dragOrigin.current && JSON.stringify(dragOrigin.current) !== JSON.stringify(ref.current)) {
      const before = dragOrigin.current;
      setUndoStack((s) => [...s.slice(-39), before]);
      setRedoStack([]);
      setLayouts([]);
      setActiveLayout(null);
      setAiStatus({ kind: 'idle' });
    }
    if (aiStatus.kind === 'loading') setAiStatus({ kind: 'idle' });
    dragOrigin.current = null;
  }
  function undo() {
    if (!undoStack.length) return;
    const prior = undoStack[undoStack.length - 1];
    const current = cloneProject(ref.current);
    setRedoStack((s) => [...s, current]);
    setUndoStack((s) => s.slice(0, -1));
    update(cloneProject(prior), false);
    setSelected(null);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const current = cloneProject(ref.current);
    setUndoStack((s) => [...s, current]);
    setRedoStack((s) => s.slice(0, -1));
    update(cloneProject(next), false);
    setSelected(null);
  }
  function rotate() {
    const current = ref.current.furniture.find((f) => f.id === selected);
    if (!current) return;
    const rotated = clampItem({ ...current, rotated: !current.rotated }, ref.current.room);
    patchItem(current.id, rotated);
  }
  function remove() {
    if (!selected) return;
    update({ ...ref.current, furniture: ref.current.furniture.filter((f) => f.id !== selected) });
    setSelected(null);
  }
  function duplicate() {
    if (!item || project.furniture.length >= 30) {
      notify('A room can contain up to 30 furniture items.');
      return;
    }
    const copy = clampItem(
      {
        ...item,
        id: crypto.randomUUID(),
        name: `${item.name.slice(0, 68)} (copy)`,
        x: item.x + 20,
        y: item.y + 20,
      },
      project.room,
    );
    update({ ...project, furniture: [...project.furniture, copy] });
    setSelected(copy.id);
    notify('Furniture copied. Check its placement.');
  }
  function addFurniture(entry: CatalogItem) {
    if (project.furniture.length >= 30) {
      notify('A room can contain up to 30 furniture items.');
      return;
    }
    const added: Furniture = {
      id: crypto.randomUUID(),
      kind: entry.kind,
      name: entry.name,
      width: entry.width,
      depth: entry.depth,
      x: 20,
      y: 20,
      owner: 'shared',
      rotated: false,
    };
    outer: for (const y of axisPositions(project.room.depth - added.depth - 10, [], 10)) {
      for (const x of axisPositions(project.room.width - added.width - 10, [], 10)) {
        const r = footprint({ ...added, x, y });
        if (
          entry.kind === 'rug' ||
          (!doorZones(project.room).some((door) => overlaps(r, door)) &&
            !project.furniture.some((f) => f.kind !== 'rug' && overlaps(r, footprint(f))))
        ) {
          added.x = x;
          added.y = y;
          break outer;
        }
      }
    }
    update({ ...project, furniture: [...project.furniture, added] });
    setSelected(added.id);
    setView('2d');
    notify(`${entry.name} added.`);
  }
  function selectLayout(option: LayoutOption) {
    cancelGeneration();
    if (aiStatus.kind === 'loading') setAiStatus({ kind: 'idle' });
    update({ ...cloneProject(option.project), name: ref.current.name }, true, true);
    setActiveLayout(option.id);
    setSelected(null);
    setView('2d');
  }

  function generate(source: Project = ref.current, confirmed?: PreferenceReview) {
    if (generating) return;
    if (source.furniture.length === 0) {
      notify('Choose at least one furniture item.');
      return;
    }
    const input = cloneProject(source);
    cancelGeneration();
    const id = generationId.current;
    const preferences = { ...aiOptions };
    if (preferences.enabled && preferences.prompt.trim() && !confirmed) {
      const controller = new AbortController();
      aiRequest.current = controller;
      setGenerating(true);
      setPreferenceReview({ project: input, prompt: preferences.prompt, draft: { requirements: [], unmetRequests: [] }, error: '' });
      void requestPreferenceReview(input, preferences.prompt, controller.signal, language).then((draft) => {
        if (id === generationId.current) setPreferenceReview({ project: input, prompt: preferences.prompt, draft, error: '' });
      }).catch((error) => {
        if (id === generationId.current && !controller.signal.aborted) setPreferenceReview({ project: input, prompt: preferences.prompt,
          draft: { requirements: [], unmetRequests: [] }, error: error instanceof Error ? error.message : 'Could not interpret the note.' });
      }).finally(() => { if (id === generationId.current) setGenerating(false); });
      return;
    }
    setAiStatus({ kind: 'idle' });
    setGenerating(true);
    setSelected(null);
    // Let the browser paint the loading state before calculating positions.
    generationTimer.current = setTimeout(async () => {
      try {
        const options = generateLayouts(input);
        const best = options.reduce((a, b) => (a.issueCount <= b.issueCount ? a : b));
        update(cloneProject(best.project), true, true);
        setLayouts(options);
        setActiveLayout(best.id);
        setSetupOpen(false);
        setView('2d');
        setZoom(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        notify(
          best.issueCount === 0
            ? 'Your layouts are ready. Choose your favourite.'
            : 'Layouts are ready. Check the placement issues.',
        );
        if (preferences.enabled) {
          const controller = new AbortController();
          aiRequest.current = controller;
          setAiStatus({ kind: 'loading' });
          try {
            const result = await requestAiPlan(input, preferences.prompt, controller.signal, confirmed, language);
            if (id !== generationId.current) return;
            update({ ...cloneProject(result.layout.project), name: ref.current.name }, true, true);
            setLayouts([result.layout, ...options]);
            setActiveLayout(result.layout.id);
            setAiStatus({ kind: 'success', plan: result.plan, language });
          } catch (error) {
            if (id !== generationId.current || controller.signal.aborted) return;
            setAiStatus({
              kind: 'fallback',
              message: error instanceof Error ? error.message : 'No AI response was received.',
            });
          }
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not create layouts.');
      } finally {
        if (id === generationId.current) setGenerating(false);
      }
    }, 100);
  }

  function cancelGeneration() {
    generationId.current++;
    if (generationTimer.current) clearTimeout(generationTimer.current);
    aiRequest.current?.abort();
    aiRequest.current = null;
    setGenerating(false);
  }

  function openSetup() {
    cancelGeneration();
    setAiStatus({ kind: 'idle' });
    setSetupOpen(true);
  }

  function startFromQuantities(room: Room, requests: FurnitureRequest[]) {
    try {
      generate(createProject(room, requests));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Check the sizes and quantities.');
    }
  }

  function save() {
    const name = saveName.trim();
    if (!name) return;
    const next = { ...project, name };
    const list = [
      { id: crypto.randomUUID(), updatedAt: new Date().toISOString(), project: cloneProject(next) },
      ...saved,
    ].slice(0, 20);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list));
      setSaved(list);
      update(next, true, true);
      setDialog(null);
      notify('Layout saved in this browser.');
    } catch {
      notify('Could not save the layout. You can download it as a JSON file.');
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 200000) {
      notify('The file is too large. The maximum size is 200 KB.');
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isProject(value)) throw new Error();
      update(value);
      setSelected(null);
      setDialog(null);
      setSetupOpen(false);
      notify('Layout opened from file.');
    } catch {
      notify('This file is not a valid DormFit layout.');
    }
  }
  async function exportPng() {
    setExportOpen(false);
    if (view !== '2d') {
      setView('2d');
      notify('Switched to 2D for export. Choose “PNG image” again.');
      return;
    }
    try {
      await exportImage(project);
      notify('Layout downloaded as PNG.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not download the image.');
    }
  }

  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          aria-label={t("DormFit home")}
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span className="brand-mark">
            <LayoutGrid size={23} strokeWidth={1.7} />
          </span>
          <span>{t("Dorm")}<span className="brand-fit">{t("Fit")}</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="main-nav" aria-label={t("Main navigation")}>
          <button
            className="active"
            onClick={() => {
              setDialog(null);
              openSetup();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <Layers size={15} />{t("Planning studio")}</button>
          <button onClick={() => setDialog('saved')}>{t("My layouts ")}<span className="nav-count">{saved.length}</span>
          </button>
          <button onClick={() => setDialog('help')}>{t("How it works")}</button>
        </nav>
        <div className="header-actions">
          <select className="language-select" aria-label={t('Language')} value={language}
            onChange={(event) => {
              cancelGeneration();
              setPreferenceReview(null);
              if (aiStatus.kind === 'loading') setAiStatus({ kind: 'idle' });
              setLanguage(event.target.value as Language);
            }}>
            <option value="en" lang="en">English</option>
            <option value="ru" lang="ru">Русский</option>
            <option value="tr" lang="tr">Türkçe</option>
          </select>
          <button className="icon-button theme-toggle" onClick={toggleTheme}
            aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
            title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}>
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button className="button ghost sample-button" onClick={() => setDialog('reset')}>
            <FolderOpen size={16} />{t("Example room")}</button>
          <button
            className="button dark header-save"
            aria-label={t('Save layout')}
            disabled={setupOpen || !project.furniture.length}
            onClick={() => {
              setSaveName(project.name);
              setDialog('save');
            }}
          >
            <Save size={16} />
            <span className="header-save-label">{t("Save layout")}</span>
          </button>
        </div>
      </header>

      <main className="app-shell">
        <section className="intro">
          <div>
            <div className="breadcrumb">
              <span>{t("My workspace")}</span>
              <ChevronRight size={12} />
              <span>{t(project.name)}</span>
            </div>
            <div className="title-row">
              <h1>{t("For your room, ")}<span>{t("the right layout.")}</span>
              </h1>
              <span className="studio-label">{t("PLANNING STUDIO")}</span>
            </div>
            <p>{t("Enter room sizes, choose furniture quantities, and find a layout that fits.")}</p>
          </div>
          {!setupOpen && (
            <div className="intro-right">
              <div className="intro-members">
                <span className="intro-room-icon">
                  <Ruler size={22} />
                </span>
                <div>
                  <strong>{t(format(state.total))}{t(" m² of space")}</strong>
                  <span>
                    {project.furniture.length}{t(" furniture items")}{t(project.room.height ? ' · h ' + format(project.room.height / 100) + ' m' : '')}
                  </span>
                </div>
              </div>
              <span className={`autosave ${storageStatus === 'error' ? 'error-text' : ''}`}>
                <span />
                {t(storageStatus === 'saved'
                  ? 'Automatically saved in this browser'
                  : 'Automatic saving is unavailable')}
              </span>
            </div>
          )}
        </section>

        {setupOpen ? (
          <RoomSetup
            project={project}
            busy={generating}
            aiOptions={aiOptions}
            onAiOptionsChange={setAiOptions}
            onGenerate={startFromQuantities}
          />
        ) : (
          <>
            <LayoutSuggestions
              layouts={layouts}
              activeId={activeLayout}
              busy={generating}
              aiOptions={aiOptions}
              aiStatus={aiStatus}
              onAiOptionsChange={(options) => {
                setAiOptions(options);
                setAiStatus({ kind: 'idle' });
                setLayouts((layouts) => layouts.filter((layout) => layout.id !== 'ai'));
                if (activeLayout === 'ai') setActiveLayout(null);
              }}
              onSelect={selectLayout}
              onGenerate={() => generate()}
              onEdit={openSetup}
            />
            <div className="workspace">
              <aside className="left-panel panel">
                <div className="panel-heading">
                  <span className="eyebrow">{t("BUILD YOUR SPACE")}</span>
                  <span className="step-counter">01 — 03</span>
                </div>
                {item && (
                  <section key={item.id} className="inspector selected-inspector" aria-label={t("Selected furniture")}>
                    <div className="section-label">
                      <h2>{t("Edit furniture")}</h2>
                      <button
                        className="icon-button small"
                        aria-label={t("Clear selection")}
                        onClick={() => setSelected(null)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <label className="text-field">{t("Name")}<input
                        aria-label={t("Furniture name")}
                        value={t(item.name)}
                        maxLength={80}
                        onChange={(e) => patchItem(item.id, { name: e.target.value })}
                        onBlur={() => {
                          if (!item.name.trim()) patchItem(item.id, { name: labels[item.kind] });
                        }}
                      />
                    </label>
                    <p className="small-muted">{t("Sizes are in centimetres. Press Enter or click outside a field to apply.")}</p>
                    <div className="field-row">
                      <NumberField
                        label={t("Furniture width")}
                        value={item.width}
                        min={20}
                        max={Math.min(400, item.rotated ? project.room.depth : project.room.width)}
                        onChange={(v) => patchItem(item.id, { width: Math.round(v) })}
                      />
                      <NumberField
                        label={t("Furniture length")}
                        value={item.depth}
                        min={20}
                        max={Math.min(400, item.rotated ? project.room.width : project.room.depth)}
                        onChange={(v) => patchItem(item.id, { depth: Math.round(v) })}
                      />
                    </div>
                    <label className="text-field">{t("Colour group")}<select
                        value={item.owner}
                        onChange={(e) => patchItem(item.id, { owner: e.target.value as Owner })}
                      >
                        <option value="a">{t("Blue")}</option>
                        <option value="b">{t("Peach")}</option>
                        <option value="shared">{t("Shared")}</option>
                      </select>
                    </label>
                    <div className="inspector-actions">
                      <button className="button secondary" onClick={rotate}>
                        <RotateCw size={14} />{t("Rotate")}</button>
                      <button
                        className="icon-button danger"
                        aria-label={t("Delete furniture")}
                        onClick={remove}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </section>

                )}
                <div
                  className="segmented sidebar-tabs"
                  role="tablist"
                  aria-label={t("Planning tools")}
                >
                  <button
                    role="tab"
                    aria-selected={tab === 'room'}
                    className={tab === 'room' ? 'selected' : ''}
                    onClick={() => setTab('room')}
                  >
                    <ScanLine size={15} />{t("Room")}</button>
                  <button
                    role="tab"
                    aria-selected={tab === 'furniture'}
                    className={tab === 'furniture' ? 'selected' : ''}
                    onClick={() => setTab('furniture')}
                  >
                    <Armchair size={15} />{t("Furniture ")}<small>{project.furniture.length}</small>
                  </button>
                </div>
                {tab === 'room' ? (
                  <div className="room-settings">
                    <div className="section-label">
                      <h2>{t("Room dimensions")}</h2>
                      <Ruler size={16} />
                    </div>
                    <p className="small-muted">{t("Every good layout starts with accurate measurements.")}</p>
                    <div className="room-outline opening-room-preview"><PlanCanvas project={{ ...project, furniture: [] }} mini /></div>
                    <div className="field-row">
                      <NumberField
                        label={t("Width")}
                        value={project.room.width / 100}
                        min={2}
                        max={MAX_ROOM_METRES}
                        suffix="m"
                        onChange={(v) =>
                          updateRoom({ ...project.room, width: Math.round(v * 100), window: Math.min(project.room.window, Math.round(v * 100) - 20) })
                        }
                      />
                      <NumberField
                        label={t("Length")}
                        value={project.room.depth / 100}
                        min={2}
                        max={MAX_ROOM_METRES}
                        suffix="m"
                        onChange={(v) =>
                          updateRoom({ ...project.room, depth: Math.round(v * 100) })
                        }
                      />
                    </div>
                    <div className="area-pill">
                      <Square size={14} />
                      <span>{t("Total area")}</span>
                      <strong>{t(format(state.total))}{t(" m²")}</strong>
                    </div>
                    <div className="section-divider" />
                    <OpeningEditor room={project.room} onChange={updateRoom} />
                    <div className="tip">
                      <Lightbulb size={17} />
                      <p>{t("Measure wall to wall. You can resize furniture separately.")}</p>
                    </div>
                    <button className="button full secondary" onClick={() => setTab('furniture')}>{t("Browse furniture")}<ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="catalog-panel">
                    <div className="section-label">
                      <h2>{t("Furniture library")}</h2>
                      <span className="tiny-label">{t("ADD ITEM")}</span>
                    </div>
                    <p className="small-muted">{t("Add an item, then adjust its size.")}</p>
                    <FurnitureSearch value={catalogSearch} onChange={setCatalogSearch} />
                    {!catalog.some(entry => matchesFurniture(entry.kind, catalogSearch)) && <p className="small-muted" role="status">{t('No furniture matches your search.')}</p>}
                    <div className="catalog-grid">
                      {catalog.filter(entry => matchesFurniture(entry.kind, catalogSearch)).map((entry) => {
                        const Icon = icons[entry.kind];
                        return (
                          <button
                            key={entry.kind}
                            className={`catalog-card catalog-${entry.kind}`}
                            title={t(entry.hint ?? entry.name)}
                            onClick={() => addFurniture(entry)}
                          >
                            <span className="catalog-illustration">
                              <Icon size={44} strokeWidth={1.5} />
                              <span className="catalog-plus">
                                <Plus size={12} />
                              </span>
                            </span>
                            <strong>{t(labels[entry.kind])}</strong>
                            <small>
                              {entry.width} × {entry.depth}{t(" cm")}</small>
                          </button>
                        );
                      })}
                    </div>
                    <div className="section-divider" />
                    <div className="section-label">
                      <h2>{t("Furniture in your room")}</h2>
                      <span className="count-pill">{project.furniture.length}</span>
                    </div>
                    <div className="furniture-list">
                      {project.furniture.length === 0 && (
                        <p className="empty-inline">{t("The room is empty. Add your first item above.")}</p>
                      )}
                      {project.furniture.map((f) => {
                        const Icon = icons[f.kind];
                        return (
                          <button
                            key={f.id}
                            className={`furniture-row ${selected === f.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelected(f.id);
                              setView('2d');
                            }}
                          >
                            <span className={`list-item-icon owner-${f.owner}`}>
                              <Icon size={17} />
                            </span>
                            <span>
                              <strong>{t(f.name)}</strong>
                              <small>
                                {f.width} × {f.depth}{t(" cm")}</small>
                            </span>
                            <ChevronRight size={13} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="sidebar-footer">
                  <ShieldCheck size={14} />
                  <span>{t("Your layout is saved in this browser.")}</span>
                  <button aria-label={t("About saving")} onClick={() => setDialog('help')}>
                    <CircleHelp size={14} />
                  </button>
                </div>
              </aside>

              <section
                ref={panelRef}
                className={`canvas-panel panel${expandedFallback ? ' is-expanded' : ''}`}
                aria-label={t("Room layout")}
              >
                <div className="canvas-toolbar">
                  <div className="canvas-title">
                    <span className="canvas-icon">
                      <Square size={15} />
                    </span>
                    <div>
                      <strong>{t("Your room layout")}</strong>
                      <span>
                        {project.room.width} × {project.room.depth}{t(" cm")}</span>
                    </div>
                  </div>
                  <div className="canvas-tools">
                    <div className="history-tools">
                      <button
                        className="icon-button"
                        aria-label={t("Undo")}
                        title={t("Undo")}
                        disabled={!undoStack.length}
                        onClick={undo}
                      >
                        <Undo2 size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("Redo")}
                        title={t("Redo")}
                        disabled={!redoStack.length}
                        onClick={redo}
                      >
                        <Redo2 size={17} />
                      </button>
                    </div>
                    <div className="segmented view-tabs" aria-label={t("View")}>
                      <button
                        className={view === '2d' ? 'selected' : ''}
                        aria-pressed={view === '2d'}
                        onClick={() => setView('2d')}
                      >{t("2D")}</button>
                      <button
                        className={view === 'iso' ? 'selected' : ''}
                        aria-pressed={view === 'iso'}
                        onClick={() => {
                          setView('iso');
                          setSelected(null);
                        }}
                      >{t("3D")}</button>
                    </div>
                    <div className="export-wrapper">
                      <button
                        className="icon-button"
                        aria-label={t("Download layout")}
                        aria-expanded={exportOpen}
                        onClick={() => setExportOpen((v) => !v)}
                      >
                        <Download size={17} />
                      </button>
                      {exportOpen && (
                        <>
                          <button
                            className="menu-scrim"
                            aria-label={t("Close download menu")}
                            onClick={() => setExportOpen(false)}
                          />
                          <div className="dropdown export-menu">
                            <button onClick={exportPng}>
                              <ArrowDownToLine size={16} />{t("PNG image")}</button>
                            <button
                              onClick={() => {
                                exportProject(project);
                                setExportOpen(false);
                                notify('Layout downloaded as JSON.');
                              }}
                            >
                              <Download size={16} />{t("Layout file (JSON)")}</button>
                            <button
                              onClick={() => {
                                setExportOpen(false);
                                importRef.current?.click();
                              }}
                            >
                              <Upload size={16} />{t("Open layout file")}</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`canvas-surface ${view === 'iso' ? 'isometric' : ''}`}>
                  <div className="canvas-topline">
                    <span className="view-label">
                      <span />
                      {t(view === '2d' ? 'TOP VIEW' : 'ISOMETRIC VIEW')}
                    </span>
                    <span className="scale-label">
                      {t(view === '2d' ? 'Each square is 20 cm' : 'Room view with illustrative heights')}
                    </span>
                  </div>
                  <div className="plan-viewport">
                    {view === '2d' ? (
                      <PlanCanvas
                        project={project}
                        selected={selected}
                        onSelect={setSelected}
                        onMove={(id, x, y) => patchItem(id, { x, y }, false)}
                        onRoomChange={(room) => updateRoom(room, false)}
                        onDragStart={startDrag}
                        onDragEnd={endDrag}
                        onRotate={rotate}
                        onDelete={remove}
                        showGrid={grid}
                        showDimensions={dimensions}
                        zoom={zoom}
                      />
                    ) : (
                      <IsoCanvas project={project} zoom={zoom} selected={selected} onSelect={setSelected} />
                    )}
                  </div>
                  {item && view === '2d' && (
                    <div className="selection-actions">
                      <span>{t(labels[item.kind])}</span>
                      <button
                        aria-label={t("Rotate selected furniture")}
                        title={t("Rotate (R)")}
                        onClick={rotate}
                      >
                        <RotateCw size={15} />
                      </button>
                      <button
                        aria-label={t("Duplicate furniture")}
                        title={t("Duplicate")}
                        onClick={duplicate}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="delete-action"
                        aria-label={t("Delete selected furniture")}
                        title={t("Delete (Delete)")}
                        onClick={remove}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                  <div className="canvas-bottomline">
                    <div className="canvas-legend">
                      <span>
                        <i className="blue-dot" />{t("Blue")}</span>
                      <span>
                        <i className="peach-dot" />{t("Peach")}</span>
                      <span>
                        <i className="neutral-dot" />{t("Shared")}</span>
                    </div>
                    <div className="canvas-controls">
                      <button
                        className={`icon-button ${grid ? 'toggled' : ''}`}
                        aria-label={t("Show or hide grid")}
                        aria-pressed={grid}
                        disabled={view === 'iso'}
                        onClick={() => setGrid((v) => !v)}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        className={`icon-button ${dimensions ? 'toggled' : ''}`}
                        aria-label={t("Show or hide dimensions")}
                        aria-pressed={dimensions}
                        disabled={view === 'iso'}
                        onClick={() => setDimensions((v) => !v)}
                      >
                        <Ruler size={16} />
                      </button>
                      <span className="control-divider" />
                      <button
                        className="icon-button"
                        aria-label={t("Zoom out")}
                        disabled={zoom <= 0.5}
                        onClick={() =>
                          setZoom((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <button
                        className="zoom-value"
                        aria-label={t("Reset zoom")}
                        title={t("Reset zoom to 100%")}
                        onClick={() => setZoom(1)}
                      >
                        {Math.round(zoom * 100)}%
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("Zoom in")}
                        disabled={zoom >= 2}
                        onClick={() => setZoom((v) => Math.min(2, Math.round((v + 0.1) * 10) / 10))}
                      >
                        <Plus size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')}
                        title={t(isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen')}
                        aria-pressed={isFullscreen}
                        onClick={() => {
                          void toggleFullscreen();
                        }}
                      >
                        {isFullscreen ? <Shrink size={15} /> : <Expand size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="canvas-status">
                  <span>
                    <MousePointer2 size={13} />
                    {t(view === '2d'
                      ? 'Drag furniture to find its place.'
                      : 'Switch to 2D to edit the layout.')}
                  </span>
                  <span>
                    <span className={`status-dot ${state.issues.length ? 'warning' : ''}`} />
                    {t(state.issues.length
                      ? `${state.issues.length} issues to check`
                      : 'No overlaps')}
                  </span>
                </div>
              </section>

              <aside className="right-panel">
                <section className="panel insights">
                  <div className="section-label">
                    <h2>{t("Room overview")}</h2>
                    <SlidersHorizontal size={16} />
                  </div>
                  <p className="small-muted">{t("How is your space being used?")}</p>
                  <div className="space-ring">
                    <svg viewBox="0 0 144 144" aria-hidden="true">
                      <circle
                        cx="72"
                        cy="72"
                        r="58"
                        fill="none"
                        stroke="#edf0f4"
                        strokeWidth="10"
                      />
                      <circle
                        cx="72"
                        cy="72"
                        r="58"
                        fill="none"
                        stroke="#6e8ceb"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${(state.freePercent / 100) * 364.42} 364.42`}
                        transform="rotate(-90 72 72)"
                      />
                    </svg>
                    <div>
                      <strong>
                        {state.freePercent}
                        <small>%</small>
                      </strong>
                      <span>{t("free space")}</span>
                    </div>
                  </div>
                  <div className="space-stats">
                    <div>
                      <span>
                        <i className="blue-dot" />{t("Free space")}</span>
                      <strong>{t(format(state.free))}{t(" m²")}</strong>
                    </div>
                    <div>
                      <span>
                        <i className="light-dot" />{t("Furniture area")}</span>
                      <strong>{t(format(state.occupied))}{t(" m²")}</strong>
                    </div>
                  </div>
                  <div className={`plan-health ${state.issues.length ? 'has-issues' : ''}`}>
                    {state.issues.length ? <TriangleAlert size={17} /> : <CheckCheck size={17} />}
                    <div>
                      <strong>
                        {t(state.issues.length ? 'Some adjustments needed' : 'Looking good!')}
                      </strong>
                      <span>
                        {t(state.issues.length
                          ? `${state.issues.length} placement issues found.`
                          : 'Furniture and the door zone are clear.')}
                      </span>
                    </div>
                  </div>
                  {state.issues.length > 0 && (
                    <div className="issue-list">
                      {state.issues.map((issue, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelected(issue.ids[0]);
                            setView('2d');
                          }}
                        >
                          {t(issue.text)}
                          <ChevronRight size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>


                  <section className="panel inventory-overview">
                    <div className="section-label">
                      <h2>{t("Your furniture")}</h2>
                      <Armchair size={16} />
                    </div>
                    <div className="inventory-overview-list">
                      {getFurnitureRequests(project)
                        .filter((request) => request.count > 0)
                        .map((request) => {
                          const Icon = icons[request.kind];
                          return (
                            <div key={request.kind}>
                              <Icon size={16} />
                              <span>{t(labels[request.kind])}</span>
                              <strong>{t(`${request.count} items`)}</strong>
                            </div>
                          );
                        })}
                    </div>
                    <button className="button secondary full" onClick={openSetup}>{t("Change quantities")}<ArrowRight size={14} />
                    </button>
                  </section>

                <div className="note-card">
                  <span className="note-icon">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <strong>{t("Make the layout your own.")}</strong>
                    <p>{t("After choosing a layout, drag or resize any furniture item.")}</p>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
        <footer className="app-footer">
          <span>
            <LayoutGrid size={14} />{t("DormFit ")}<span>{t("Small space, big possibilities.")}</span>
          </span>
          <button onClick={() => setDialog('help')}>
            <CircleHelp size={14} />{t("Help and keyboard shortcuts")}</button>
          <span>{t("Your room. Your rules.")}</span>
        </footer>
      </main>

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        aria-label={t("Choose a DormFit layout file")}
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{t(toast)}</span>
          <button aria-label={t("Dismiss notification")} onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {preferenceReview && <PreferenceReviewModal project={preferenceReview.project} prompt={preferenceReview.prompt}
        review={preferenceReview.draft} busy={generating} error={preferenceReview.error}
        onChange={(draft) => setPreferenceReview({ ...preferenceReview, draft })}
        onClose={() => { cancelGeneration(); setPreferenceReview(null); }}
        onConfirm={() => { const pending = preferenceReview; setPreferenceReview(null); generate(pending.project, pending.draft); }} />}
      {dialog === 'save' && (
        <Modal title={t("Name your layout")} onClose={() => setDialog(null)}>
          <p className="modal-description">{t("Open your saved layout later under “My layouts”. It is stored only in this browser.")}</p>
          <form
            onInvalid={showValidation} onInput={clearValidation}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="text-field">{t("Layout name")}<input
                autoFocus
                required
                maxLength={80}
                value={t(saveName)}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={t("For example, autumn semester")}
              />
            </label>
            <div className="modal-summary">
              <PlanCanvas project={project} mini />
              <span>
                <strong>{t(format(state.total))}{t(" m²")}</strong>
                {project.furniture.length}{t(" furniture items")}</span>
            </div>
            <button className="button primary full" type="submit" disabled={!saveName.trim()}>
              <Save size={16} />{t("Save in this browser")}</button>
          </form>
        </Modal>
      )}
      {dialog === 'saved' && !deleteTarget && (
        <Modal title={t("Your layouts")} onClose={() => setDialog(null)} wide>
          <p className="modal-description">{t("Layouts saved in this browser. To open one on another device, download it as a JSON file.")}</p>
          {!saved.length ? (
            <div className="empty-saved">
              <FolderOpen size={38} strokeWidth={1.2} />
              <h3>{t("Your first layout belongs here.")}</h3>
              <p>{t("Set up your room and choose “Save layout”.")}</p>
              <button
                className="button primary"
                onClick={() => {
                  setSaveName(project.name);
                  setDialog('save');
                }}
              >{t("Save current layout")}<ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="saved-grid">
              {saved.map((s) => (
                <article className="saved-card" key={s.id}>
                  <button
                    className="saved-open"
                    onClick={() => {
                      update(cloneProject(s.project));
                      setSelected(null);
                      setDialog(null);
                      setSetupOpen(false);
                      notify('Saved layout opened.');
                    }}
                  >
                    <PlanCanvas project={s.project} mini />
                    <strong>{t(s.project.name)}</strong>
                    <span>
                      {t(new Date(s.updatedAt).toLocaleDateString(locales[language]))} ·{t(' ')}
                      {t(format((s.project.room.width * s.project.room.depth) / 10000))}{t(" m²")}</span>
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={t(`${s.project.name} delete layout`)}
                    onClick={() => {
                      setDeleteError('');
                      setDeleteTarget(s);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <button className="button secondary full" onClick={() => importRef.current?.click()}>
            <Upload size={16} />{t("Open layout file")}</button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title={t('Delete saved layout?')} onClose={() => setDeleteTarget(null)}>
          <p className="modal-description">{t('This will delete the saved layout from this browser.')}</p>
          <p><strong>{t(deleteTarget.project.name)}</strong></p>
          {deleteError && <p className="form-error" role="alert">{t(deleteError)}</p>}
          <div className="modal-actions">
            <button type="button" className="button secondary" autoFocus onClick={() => setDeleteTarget(null)}>{t('Cancel')}</button>
            <button type="button" className="button danger" onClick={() => {
              const next = saved.filter((entry) => entry.id !== deleteTarget.id);
              try {
                localStorage.setItem(SAVED_KEY, JSON.stringify(next));
                setSaved(next);
                setDeleteTarget(null);
                notify('Layout deleted.');
              } catch {
                setDeleteError('Could not delete the layout.');
              }
            }}><Trash2 size={16} />{t('Delete layout')}</button>
          </div>
        </Modal>
      )}
      {dialog === 'reset' && (
        <Modal title={t("Open the example room?")} onClose={() => setDialog(null)}>
          <p className="modal-description">{t("This opens a furnished 4.2 × 3.6 metre example. Save your current work first, or restore it afterwards with Undo.")}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDialog(null)}>{t("Keep current layout")}</button>
            <button
              className="button primary"
              onClick={() => {
                update(defaultProject());
                setSelected(null);
                setDialog(null);
                setView('2d');
                setZoom(1);
                setSetupOpen(false);
                notify('Example room opened.');
              }}
            >{t("Open example")}<ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'help' && (
        <Modal title={t("Make room for everything.")} onClose={() => setDialog(null)} wide>
          <p className="modal-description">{t("DormFit helps you try furniture layouts using your room measurements.")}</p>
          <div className="help-steps">
            {[
              {
                Icon: Ruler,
                title: '01. Measure your room',
                text: 'Enter room width and length in metres. Adjust door and window widths in centimetres.',
              },
              {
                Icon: Move,
                title: '02. Choose quantities',
                text: 'Choose how many beds, wardrobes and desks you need. Replace the default sizes with your own measurements.',
              },
              {
                Icon: LayoutGrid,
                title: '03. Choose a layout',
                text: 'Compare layouts. Move furniture in your chosen layout, then save or download your changes.',
              },
            ].map(({ Icon, title, text }) => (
              <div key={title}>
                <span>
                  <Icon size={20} />
                </span>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </div>
            ))}
          </div>
          <div className="keyboard-help">
            <span>
              <kbd>↑ ↓ ← →</kbd>{t("Move 5 cm")}</span>
            <span>
              <kbd>{t("Shift + arrow")}</kbd>{t("Move 10 cm")}</span>
            <span>
              <kbd>{t("R")}</kbd>{t("Rotate 90°")}</span>
            <span>
              <kbd>{t("Delete")}</kbd>{t("Delete selected item")}</span>
          </div>
          <div className="help-note">
            <Lightbulb size={19} />
            <p>{t("Free space is based on furniture footprints; rugs do not take up extra floor space. Layouts use floor measurements. Height is saved for reference. Check walking space, wardrobe doors and actual dimensions in your room.")}</p>
          </div>
          <button className="button primary" onClick={() => setDialog(null)}>{t("Start planning")}<ArrowRight size={15} />
          </button>
        </Modal>
      )}
    </>
  );
}
