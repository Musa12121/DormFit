import { t } from '../i18n';
import { Plus, Trash2 } from 'lucide-react';
import type { Project } from '../domain/model';
import type { PlacementRequirement, PreferenceReview } from '../domain/ai';
import { isPreferenceReview, targetOptions } from '../domain/ai';
import Modal from './Modal';

interface Props {
  project: Project;
  prompt: string;
  review: PreferenceReview;
  busy: boolean;
  error: string;
  onChange: (review: PreferenceReview) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function PreferenceReviewModal({ project, prompt, review, busy, error, onChange, onConfirm, onClose }: Props) {
  const targets = targetOptions(project);
  function change(index: number, patch: Partial<PlacementRequirement>) {
    onChange({ ...review, requirements: review.requirements.map((rule, i) => {
      if (i !== index) return rule;
      const next = { ...rule, ...patch };
      if (next.itemId === next.targetId) next.targetId = targets.find((target) => target.id !== next.itemId)!.id;
      return next;
    }) });
  }
  const contradictory = review.requirements.some((rule, i) => review.requirements.some((other, j) =>
    i !== j && rule.itemId === other.itemId && rule.targetId === other.targetId && rule.relation !== other.relation));
  return <Modal title={t("Review your preferences")} onClose={onClose} wide>
    <p className="modal-description">{t("Check what AI understood before it places any furniture. Change, add or remove conditions below.")}</p>
    <blockquote className="review-note">{prompt}</blockquote>
    {busy && <p role="status">{t("Reading your note… No AI layout has been generated yet.")}</p>}
    {error && <p role="alert" className="form-error">{t(error)}{t(" You can still edit conditions manually.")}</p>}
    <div className="review-rules" aria-label={t("Placement conditions")}>
      {review.requirements.map((rule, index) => <fieldset key={index} className="review-rule" disabled={busy}>
        <legend>{t("Condition ")}{index + 1}</legend>
        <label>{t("Furniture")}<select aria-label={t(`Condition ${index + 1} furniture`)} value={rule.itemId} onChange={(event) => change(index, { itemId: event.target.value })}>
          {project.furniture.map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
        </select></label>
        <label>{t("Position")}<select aria-label={t(`Condition ${index + 1} relation`)} value={rule.relation} onChange={(event) => change(index, { relation: event.target.value as PlacementRequirement['relation'] })}>
          <option value="near">{t("Near (within 60 cm)")}</option><option value="away">{t("Away (at least 100 cm)")}</option>
        </select></label>
        <label>{t("Target")}<select aria-label={t(`Condition ${index + 1} target`)} value={rule.targetId} onChange={(event) => change(index, { targetId: event.target.value })}>
          {targets.filter((target) => target.id !== rule.itemId).map((target) => <option key={target.id} value={target.id}>{t(target.label)}</option>)}
        </select></label>
        <button type="button" className="icon-button danger" aria-label={t(`Remove condition ${index + 1}`)} onClick={() => onChange({ ...review, requirements: review.requirements.filter((_, i) => i !== index) })}><Trash2 size={16} /></button>
      </fieldset>)}
      {!busy && review.requirements.length === 0 && <p>{t("No placement conditions. You can add one below or confirm an unconstrained layout.")}</p>}
    </div>
    <button type="button" className="button secondary" disabled={busy || review.requirements.length >= 30} onClick={() => onChange({ ...review, requirements: [...review.requirements, {
      itemId: project.furniture[0].id, targetId: targets.find((target) => target.id !== project.furniture[0].id)!.id, relation: 'near',
    }] })}><Plus size={14} />{t("Add condition")}</button>
    {review.unmetRequests.length > 0 && <div className="review-unsupported" role="note"><strong>{t("Requests AI could not turn into a placement condition")}</strong>
      <p>{t("These will remain visible with the result. Remove an entry if you no longer want it.")}</p>
      {review.unmetRequests.map((note, index) => <div key={index}><span>{note}</span><button type="button" className="icon-button" disabled={busy} aria-label={t(`Remove unsupported request ${index + 1}`)} onClick={() => onChange({ ...review, unmetRequests: review.unmetRequests.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>)}
    </div>}
    {contradictory && <p role="alert" className="form-error">{t("An item cannot be both near and away from the same target. Edit or remove one condition.")}</p>}
    <p className="modal-description">{t("Only the conditions you confirm here will be required. The original note will not restore conditions you remove.")}</p>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("Back to editing")}</button>
      <button type="button" className="button primary" disabled={busy || contradictory || !isPreferenceReview(review, project)} onClick={onConfirm}>{t("Confirm & create layout")}</button></div>
  </Modal>;
}
