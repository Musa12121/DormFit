import type { ComponentType, ReactNode } from 'react';
import type { FurnitureKind } from '../domain/model';

interface IconProps { size?: number; strokeWidth?: number }

// Front-view silhouettes make the catalog easier to recognise than generic symbols.
const drawings: Record<FurnitureKind, ReactNode> = {
  bed: <><path d="M3 19V9h18v10M3 16h18M5 9V5h14v4M5 19v2M19 19v2" /><rect x="7" y="6" width="10" height="4" rx="1" /></>,
  'double-bed': <><path d="M2 19V9h20v10M2 16h20M4 9V4h16v5M4 19v2M20 19v2" /><rect x="5" y="5" width="6" height="5" rx="1" /><rect x="13" y="5" width="6" height="5" rx="1" /></>,
  'bunk-bed': <><path d="M2 22V2M22 22V2M2 8h20M2 17h20M3 5h18v3M3 14h18v3M17 8v14M21 8v14M17 12h4M17 16h4M17 20h4" /><path d="M5 4h5M5 13h5" /></>,
  desk: <><path d="M2 13h20M4 13v8M20 13v8M8 10h8M12 8v2" /><rect x="6" y="2" width="12" height="6" rx="1" /><path d="M5 17h3M16 17h3" /></>,
  wardrobe: <><rect x="3" y="2" width="18" height="19" rx="1" /><path d="M12 2v19M9 10v3M15 10v3M5 21v1M19 21v1" /></>,
  shelf: <><path d="M3 22V2h18v20M3 10h18M3 19h18M6 4v6M9 4v6M12 5l2 5M6 13v6M10 13v6M14 12v7M18 13v6" /></>,
  plant: <><path d="M7 15h10l-2 7H9zM12 15V6M12 10C4 11 4 3 4 3s8 0 8 7ZM12 13c0-8 8-9 8-9s0 9-8 9Z" /></>,
  rug: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="m12 7 5 5-5 5-5-5zM6 1v3M10 1v3M14 1v3M18 1v3M6 20v3M10 20v3M14 20v3M18 20v3" /></>,
  sofa: <><path d="M5 10V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M4 19v2M20 19v2" /><path d="M3 10a2 2 0 0 1 2 2v3h14v-3a2 2 0 1 1 4 0v7H1v-7a2 2 0 0 1 2-2ZM9 10v5M15 10v5" /></>,
  armchair: <><rect x="6" y="3" width="12" height="12" rx="3" /><path d="M4 10a2 2 0 0 1 2 2v3h12v-3a2 2 0 1 1 4 0v7H2v-7a2 2 0 0 1 2-2ZM5 19v3M19 19v3" /></>,
  chair: <><rect x="5" y="2" width="14" height="9" rx="1" /><path d="M6 11v4M18 11v4M4 15h16v3H4zM6 18v4M18 18v4M9 4v5M15 4v5" /></>,
  'office-chair': <><rect x="7" y="2" width="10" height="9" rx="3" /><path d="M12 11v3M5 10v5h14v-5M4 10h3M17 10h3M7 15v2h10v-2M12 17v4M5 21h14" /><circle cx="5" cy="22" r="1" /><circle cx="19" cy="22" r="1" /></>,
  television: <><rect x="2" y="3" width="20" height="14" rx="1" /><path d="M5 6h14v8H5zM8 17l-2 4M16 17l2 4M5 21h4M15 21h4" /></>,
  nightstand: <><rect x="3" y="11" width="18" height="10" rx="1" /><path d="M5 21v1M19 21v1M9 15h6M13 11V7M9 7l2-5h4l2 5z" /></>,
  dresser: <><rect x="3" y="2" width="18" height="19" rx="1" /><path d="M3 8h18M3 14h18M10 5h4M10 11h4M10 18h4M5 21v1M19 21v1" /></>,
  cabinet: <><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M12 5v16M9 12v3M15 12v3M5 21v1M19 21v1M3 3h18" /></>,
  'shoe-rack': <><path d="M2 22V3h20v19M2 12h20M2 21h20M5 6v3h6l-3-3M14 6v3h6l-3-3M5 15v3h6l-3-3M14 15v3h6l-3-3" /></>,
  'coffee-table': <><path d="M2 12h20v3H2zM5 15l-1 6M19 15l1 6M5 9h6v3H5z" /><path d="M15 7h4v5h-4zM19 8h2v3h-2" /></>,
  'dining-table': <><path d="M1 8h22v4H1zM4 12v10M20 12v10M8 12v7M16 12v7" /><ellipse cx="8" cy="6" rx="4" ry="2" /><ellipse cx="18" cy="6" rx="3" ry="2" /></>,
  fridge: <><rect x="5" y="1" width="14" height="21" rx="2" /><path d="M5 8h14M8 4v2M8 11v5M7 22v1M17 22v1" /></>,
  'tv-stand': <><rect x="5" y="1" width="14" height="9" rx="1" /><path d="M10 10v3M14 10v3M2 13h20v8H2zM9 13v8M15 13v8M5 17h1M18 17h1M4 21v2M20 21v2" /></>,
  'washing-machine': <><rect x="3" y="2" width="18" height="20" rx="2" /><path d="M3 7h18M6 5h4" /><circle cx="17" cy="4.5" r=".7" /><circle cx="12" cy="14" r="5" /><path d="M8 15c3-3 5 2 8-1" /></>,
  'storage-box': <><path d="M3 8h18v13H3zM2 5h20v3H2zM9 12h6v3H9z" /></>,
  'floor-lamp': <><path d="m7 2-3 8h16l-3-8zM12 10v11M6 22h12M18 10v4" /></>,
  // Icons for items imported from older saved layouts.
  stool: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M6 8 4 22M18 8l2 14M6 16h12" /></>,
  bench: <><path d="M2 7h20v5H2zM4 12v10M20 12v10M4 18h16M2 9h20" /></>,
  'side-table': <><ellipse cx="12" cy="7" rx="9" ry="4" /><path d="M5 10v12M19 10v12M12 11v8" /></>,
  vanity: <><ellipse cx="12" cy="6" rx="5" ry="5" /><path d="M2 12h20v3H2zM4 15v7M20 15v7M7 15v5h10v-5" /></>,
  ottoman: <><rect x="3" y="6" width="18" height="12" rx="4" /><path d="M3 11h18M6 18v4M18 18v4" /></>,
  'clothes-rack': <><path d="M3 22V3h18v19M1 22h4M19 22h4M12 3v4l-5 6h10l-5-6" /></>,
};

function makeIcon(kind: FurnitureKind): ComponentType<IconProps> {
  return function FurnitureIcon({ size = 24, strokeWidth = 1.7 }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-furniture-icon={kind}>
      {drawings[kind]}
    </svg>;
  };
}

export const furnitureIcons = Object.fromEntries(Object.keys(drawings).map(kind =>
  [kind, makeIcon(kind as FurnitureKind)])) as Record<FurnitureKind, ComponentType<IconProps>>;
