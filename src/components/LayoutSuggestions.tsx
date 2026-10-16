import { getLanguage, t } from '../i18n';
import { ArrowRight, Check, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import type { LayoutOption } from '../domain/planner';
import type { AiOptions, AiStatus } from '../domain/ai';
import { requirementLabel } from '../domain/ai';
import AiControls from './AiControls';
import PlanCanvas from './PlanCanvas';

interface Props {
  layouts: LayoutOption[];
  activeId: string | null;
  busy: boolean;
  aiOptions: AiOptions;
  aiStatus: AiStatus;
  onAiOptionsChange: (options: AiOptions) => void;
  onSelect: (layout: LayoutOption) => void;
  onGenerate: () => void;
  onEdit: () => void;
}

export default function LayoutSuggestions({
  layouts,
  activeId,
  busy,
  aiOptions,
  aiStatus,
  onAiOptionsChange,
  onSelect,
  onGenerate,
  onEdit,
}: Props) {
  const hasValidLayout = layouts.some((layout) => layout.issueCount === 0);
  const aiLayout = layouts.find((layout) => layout.id === 'ai');
  const regularLayouts = layouts.filter((layout) => layout.id !== 'ai');

  function layoutCard(option: LayoutOption, index: number) {
    const isAi = option.id === 'ai';
    return <button key={option.id} data-layout-id={option.id}
      className={`layout-card ${isAi ? 'ai-layout-card' : ''} ${activeId === option.id ? 'active' : ''}`}
      aria-pressed={activeId === option.id} onClick={() => onSelect(option)}>
      {isAi && <div className="ai-card-banner"><Sparkles size={18} /><span>{t("DESIGNED BY GEMINI AI")}</span><span className="ai-card-selected">{t(activeId === 'ai' ? 'Selected' : 'View AI plan')}</span></div>}
      <div className="layout-preview">
        <PlanCanvas project={option.project} mini />
        <span className={`layout-tag ${option.issueCount ? 'tag-warning' : ''}`}>
          {t(option.issueCount ? `${option.issueCount} issues` : <><Check size={11} />{t("No overlaps")}</>)}
        </span>
      </div>
      <div className="layout-card-body">
        {!isAi && <span className="option-number">0{index + 1}</span>}
        <div><strong>{t(option.name)}</strong>
          <span className="ai-recommended">{t(isAi ? <><Sparkles size={13} />{t("Gemini layout")}</> : 'Regular layout · notes not applied')}</span>
          {isAi && <p className="ai-card-purpose">{t(aiOptions.prompt.trim() ? 'Uses the placement conditions you confirmed.' : 'Personalised positions based on your room and furniture.')}{t(" Checked for room boundaries, furniture overlaps and door clearance.")}</p>}
          <p>{t(option.description)}</p>
        </div>
        <span className={`layout-radio ${activeId === option.id ? 'checked' : ''}`}>{activeId === option.id && <Check size={12} />}</span>
      </div>
    </button>;
  }
  return (
    <section className="layouts-section results-section" aria-label={t("Layout suggestions")}>
      <div className="layouts-heading">
        <div>
          <span className="eyebrow">{t("STEP 03 / 03")}</span>
          <h2>{t("Layout suggestions for your room")}<span>.</span>
          </h2>
          <p>
            {t(layouts.length
              ? 'Choose a layout, then edit it in the room view below.'
              : 'The layout has changed. Create suggestions for the new measurements.')}
          </p>
        </div>
        <div className="results-actions">
          <button className="button secondary" onClick={onEdit}>
            <Settings2 size={15} />{t("Change sizes and quantities")}</button>
          <button className="button primary generate-button" disabled={busy} onClick={onGenerate}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            {t(busy ? 'Creating…' : 'Generate layouts')}
          </button>
        </div>
      </div>
      <AiControls options={aiOptions} disabled={busy} onChange={onAiOptionsChange} />
      {aiStatus.kind !== 'idle' && (
        <div className={`ai-insight ai-${aiStatus.kind}`} role="status" aria-live="polite">
          <Sparkles size={18} className={aiStatus.kind === 'loading' ? 'spin' : ''} />
          <div>
            <strong>
              {t(aiStatus.kind === 'loading'
                ? 'Gemini is creating a layout using your notes…'
                : aiStatus.kind === 'success'
                  ? 'Gemini placed your furniture'
                  : 'AI layout failed — showing regular layouts')}
            </strong>
            {aiStatus.kind === 'loading' && (
              <p>{t("Regular layouts are shown for now; they do not use your notes. Selecting one will cancel the AI request.")}</p>
            )}
            {aiStatus.kind === 'fallback' && (
              <><p>{t(aiStatus.message)}</p><p>{t("Regular layouts do not use your written notes.")}</p></>
            )}
            {aiStatus.kind === 'success' && aiLayout && (
              <>
                {activeId !== 'ai' && <p className="ai-selection-note">{t("A regular layout is currently selected. Select the “Gemini layout” card to see the layout created using your notes.")}</p>}
                {aiStatus.language && aiStatus.language !== getLanguage() && <p className="ai-selection-note">{t('Generate layouts again to get AI explanations in the selected language.')}</p>}
                <p lang={aiStatus.language}>{t(aiStatus.plan.explanation)}</p>
                {aiStatus.plan.adjusted && <p>{t("The app adjusted the positions to fit the room. The placement conditions below were preserved and checked again.")}</p>}
                {aiStatus.plan.requirements.length > 0 && (
                  <>
                    <p><strong>{t("Conditions understood by AI and checked by the app:")}</strong></p>
                    <ul className="ai-requirements">
                      {aiStatus.plan.requirements.map((rule, index) => (
                        <li key={index}>{t(requirementLabel(aiLayout.project, rule))} ✓</li>
                      ))}
                    </ul>
                  </>
                )}
                {aiStatus.plan.unmetRequests.length > 0 && (
                  <div className="ai-unmet" role="note">
                    <strong>{t("Requests not fully met:")}</strong>
                    <ul lang={aiStatus.language}>{aiStatus.plan.unmetRequests.map((note, index) => <li key={index}>{note}</li>)}</ul>
                  </div>
                )}
                {aiStatus.plan.tips.length > 0 && (
                  <ul lang={aiStatus.language}>
                    {aiStatus.plan.tips.map((tip, index) => <li key={index}>{t(tip)}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {layouts.length > 0 && !hasValidLayout && (
        <p className="layout-warning" role="alert">{t("No layout could fit all selected furniture without overlaps. Change the quantities or sizes, or adjust the layout yourself.")}</p>
      )}
      {layouts.length > 0 ? (
        <>
          {aiLayout && <section className="featured-ai-section" aria-label={t("AI-designed layout")}>
            <div className="layout-group-heading"><Sparkles size={20} /><div><h3>{t("Your AI-designed layout")}</h3><p>{t("Generated by Gemini for your room, with placement checks by DormFit.")}</p></div></div>
            {layoutCard(aiLayout, 0)}
          </section>}
          {regularLayouts.length > 0 && <section className="algorithm-layout-section" aria-label={t("Algorithm layouts")}>
            <div className="layout-group-heading"><div><h3>{t("Algorithm layouts")}</h3><p>{t("Calculated locally using placement rules. These options do not use your written notes.")}</p></div></div>
            <div className="layout-options">{regularLayouts.map(layoutCard)}</div>
          </section>}
        </>
      ) : (
        <button className="layout-empty regenerate-empty" disabled={busy} onClick={onGenerate}>
          <RefreshCw size={22} />
          <div>
            <strong>{t("Find new layouts.")}</strong>
            <p>{t("Compare three approaches for your current furniture.")}</p>
          </div>
          <ArrowRight size={18} />
        </button>
      )}
    </section>
  );
}
