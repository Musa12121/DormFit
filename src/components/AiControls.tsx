import { t } from '../i18n';
import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import type { AiOptions } from '../domain/ai';

interface Props {
  options: AiOptions;
  disabled: boolean;
  onChange: (options: AiOptions) => void;
}

export default function AiControls({ options, disabled, onChange }: Props) {
  const promptId = useId();
  return (
    <div className="ai-controls">
      <label className="ai-toggle">
        <input
          type="checkbox"
          checked={options.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ ...options, enabled: event.target.checked })}
        />
        <Sparkles size={16} />
        <span>{t("Create an AI layout")}</span>
      </label>
      <p className="ai-caption" id={`${promptId}-help`}>{t('AI uses your room measurements and furniture. Adding a note is optional.')}</p>
      {options.enabled && (
        <>
          <div className="ai-prompt">
            <label htmlFor={promptId}>{t("Your room preferences")} <span aria-hidden="true">({t('optional')})</span></label>
            <textarea
              id={promptId}
              aria-label={t('Your room preferences')}
              aria-describedby={`${promptId}-help`}
              value={options.prompt}
              disabled={disabled}
              maxLength={600}
              rows={3}
              placeholder={t("For example: place the plant near the window and the bed away from the door.")}
              onChange={(event) => onChange({ ...options, prompt: event.target.value })}
            />
          </div>
          <p className="ai-caption">{t("Creating an AI layout sends room measurements, furniture and your note to Gemini. Gemini chooses furniture positions. The app checks sizes, overlaps and the placement conditions in its response.")}</p>
          <p className="ai-caption">{t('Google’s unpaid API may use AI inputs and responses to train models, with possible human review. Leave out personal or confidential information.')} <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">{t('Google Gemini API terms and data use')}</a></p>
          {options.prompt.trim() && <p className="ai-caption">{t('You can write in different languages, even within the same note. Review the conditions AI understood before confirming.')}</p>}
        </>
      )}
    </div>
  );
}
