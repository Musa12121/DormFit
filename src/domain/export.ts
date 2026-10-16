import type { Project } from './model';
import { t } from '../i18n';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportProject(project: Project) {
  download(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
    'dormfit-plan.json',
  );
}
export async function exportImage(project: Project) {
  const element = document.querySelector<SVGSVGElement>('#room-plan');
  if (!element) throw new Error('Switch to the 2D view first.');
  const copy = element.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.style.width = '';
  // Export the full measured plan, independent of the editor's current zoom.
  if (element.dataset.baseViewBox) copy.setAttribute('viewBox', element.dataset.baseViewBox);
  copy.setAttribute('width', '1600');
  copy.setAttribute('height', '1300');
  copy.querySelectorAll('[tabindex]').forEach((n) => n.removeAttribute('tabindex'));
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], {
      type: 'image/svg+xml;charset=utf-8',
    }),
  );
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser does not support image export.');
    ctx.fillStyle = '#fcfbf8';
    ctx.fillRect(0, 0, 1600, 1440);
    ctx.fillStyle = '#292f3a';
    ctx.font = '600 32px Arial';
    ctx.fillText(`DormFit / ${t(project.name)}`, 65, 60);
    ctx.drawImage(image, 0, 65, 1600, 1300);
    ctx.fillStyle = '#858b95';
    ctx.font = '20px Arial';
    ctx.fillText(
      `${project.room.width} × ${project.room.depth} ${t('cm')} · ${t('Check measurements in your actual room.')}`,
      65,
      1395,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create the image.');
    download(blob, 'dormfit-plan.png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
