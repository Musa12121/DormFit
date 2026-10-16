import { Search } from 'lucide-react';
import { furnitureLabels } from '../domain/model';
import type { FurnitureKind } from '../domain/model';
import { getLanguage, t } from '../i18n';

export function matchesFurniture(kind: FurnitureKind, query: string) {
  const label = furnitureLabels[kind];
  return `${label} ${t(label)}`.toLocaleLowerCase(getLanguage()).includes(query.trim().toLocaleLowerCase(getLanguage()));
}

export default function FurnitureSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="furniture-search">
    <Search size={16} aria-hidden="true" />
    <input type="search" aria-label={t('Search furniture')} placeholder={t('Search furniture…')}
      value={value} onChange={event => onChange(event.target.value)} />
  </label>;
}
