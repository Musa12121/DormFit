import type { Project } from '../domain/model';
import { isChair } from '../domain/usability';
import { t } from '../i18n';

export default function ChairOmissions({ project }: { project: Project }) {
  const omitted = project.omittedChairs ?? [];
  if (!omitted.length) return null;
  const placed = project.furniture.filter(isChair).length;
  return <div className="chair-omissions" role="note">
    <strong>{t(`Chairs placed: ${placed} of ${placed + omitted.length}. Left out: ${omitted.length}.`)}</strong>
    <p>{t('The remaining chairs could not fit with safe spacing and access.')}</p>
    <p>{omitted.map(item => t(item.name)).join(', ')}</p>
  </div>;
}
