import { t } from '../i18n';
import { useEffect, useId, useState } from 'react';

export default function NumberField({
  label,
  value,
  min,
  max,
  suffix = 'cm',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  function commit() {
    const n = Number(draft.replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) {
      setError(true);
      return;
    }
    setError(false);
    onChange(n);
  }
  return (
    <div className={`number-field ${error ? 'field-error' : ''}`}>
      <label htmlFor={id}>{t(label)}</label>
      <div>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              setDraft(String(value));
              setError(false);
            }
          }}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{t(suffix)}</span>
      </div>
      {error && (
        <small id={`${id}-error`}>{t(`Enter ${min}–${max} ${suffix}.`)}
        </small>
      )}
    </div>
  );
}
