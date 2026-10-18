import { t } from '../i18n';
import type { Project } from '../domain/model';
import { isWallMounted } from '../domain/model';
import { footprint } from '../domain/planner';
import { colors } from './FurnitureShape';
import IsoWardrobe from './IsoWardrobe';
import IsoFurniture from './IsoFurniture';
import { furniturePoint, rotationOf } from '../domain/rotation';
import { getOpenings, openingLabel, openingSegment } from '../domain/openings';
import { validWallMount } from '../domain/mounting';

export default function IsoCanvas({ project, zoom = 1, selected, onSelect }: {
  project: Project;
  zoom?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const { width: w, depth: d } = project.room;
  const p = (x: number, y: number, z = 0) => [x * 0.8 - y * 0.65, x * 0.36 + y * 0.44 - z];
  const points = (vertices: number[][]) =>
    vertices.map((v) => p(v[0], v[1], v[2] || 0).join(',')).join(' ');
  const maxX = w * 0.8,
    minX = -d * 0.65,
    maxY = w * 0.36 + d * 0.44;
  const width = maxX - minX + 90,
    height = maxY + 195;
  const viewBox = `${minX - 45 + (width - width / zoom) / 2} ${-140 + (height - height / zoom) / 2} ${width / zoom} ${height / zoom}`;
  const isForeground = (opening: ReturnType<typeof getOpenings>[number]) => opening.wall === 'bottom' || opening.wall === 'right';
  const renderOpening = (opening: ReturnType<typeof getOpenings>[number]) => {
    const { x, y, width, depth } = openingSegment(project.room, opening);
    const bottom = opening.kind === 'window' ? 30 : 0;
    const knob = p(x + width * .8, y + depth * .8, 30);
    const label = p(x + width / 2, y + depth / 2, 76);
    const foreground = isForeground(opening);
    return <g key={opening.id} data-opening={opening.id} data-wall={opening.wall}
      data-depth-layer={foreground ? 'foreground' : 'background'} pointerEvents="none"
      aria-label={t(`${openingLabel(project.room, opening)}, ${opening.wall} wall`)}>
      <polygon points={points([[x, y, bottom], [x + width, y + depth, bottom], [x + width, y + depth, 68], [x, y, 68]])}
        fill={opening.kind === 'window' ? '#d3e7ee' : '#edb665'}
        fillOpacity={foreground && opening.kind === 'window' ? .35 : 1}
        stroke={opening.kind === 'window' ? '#a1bdc8' : '#ae6617'} strokeWidth={opening.kind === 'door' ? 4 : 2} />
      {opening.kind === 'door' && <><circle cx={knob[0]} cy={knob[1]} r="3" fill="#714112" /><text x={label[0]} y={label[1]} textAnchor="middle" fontSize={9.54} fontWeight="800" fill="#b97319">{t(openingLabel(project.room, opening).toUpperCase())}</text></>}
    </g>;
  };
  return (
    <svg className="iso-svg" viewBox={viewBox} role="img" aria-label={t("Isometric room view")}>
      <defs>
        <pattern id="iso-floor" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="#d4c9b5" strokeWidth=".6" />
        </pattern>
      </defs>
      <polygon
        points={points([
          [0, 0, 0],
          [w, 0, 0],
          [w, d, 0],
          [0, d, 0],
        ])}
        fill="#f1e9da"
        stroke="#ccc1af"
        strokeWidth="2"
      />
      <polygon
        points={points([
          [0, 0, 0],
          [w, 0, 0],
          [w, 0, 80],
          [0, 0, 80],
        ])}
        fill="#e6e7e4"
        stroke="#d2d5d0"
      />
      <polygon
        points={points([
          [0, 0, 0],
          [0, d, 0],
          [0, d, 80],
          [0, 0, 80],
        ])}
        fill="#f0f0ec"
        stroke="#d2d5d0"
      />
      {project.furniture.filter(item => isWallMounted(item) && validWallMount(item, project.room)
        && [90, 180].includes(rotationOf(item))).map(item => {
        // The front/right walls are normally cut away. Retain the section that
        // supports a mounted TV, with a visible edge joining it to the floor.
        const rect = footprint(item), right = rotationOf(item) === 90;
        const start = Math.max(0, (right ? rect.y : rect.x) - 10);
        const end = Math.min(right ? d : w, (right ? rect.y + rect.depth : rect.x + rect.width) + 10);
        const a = right ? [w, start] : [start, d];
        const b = right ? [w, end] : [end, d];
        return <g key={`wall-${item.id}`} data-tv-wall={item.id} data-wall={right ? 'right' : 'bottom'}>
          <polygon points={points([[...a, 0], [...b, 0], [...b, 80], [...a, 80]])}
            fill={right ? '#e6e7e4' : '#f0f0ec'} stroke="#b9beb7" strokeWidth="1" />
          <path d={`M${p(a[0], a[1]).join(' ')}L${p(b[0], b[1]).join(' ')}`}
            stroke="#a3aaa1" strokeWidth="2" />
        </g>;
      })}
      {getOpenings(project.room).filter(opening => !isForeground(opening)).map(renderOpening)}
      {[...project.furniture]
        .sort(
          (a, b) => Number(a.kind !== 'rug') - Number(b.kind !== 'rug') || a.x + a.y - b.x - b.y,
        )
        .map((item) => {
          const selectionProps = {
            role: onSelect ? 'button' : undefined,
            tabIndex: onSelect ? 0 : undefined,
            'aria-label': onSelect ? t(`Select ${item.name}`) : undefined,
            'aria-pressed': onSelect ? selected === item.id : undefined,
            className: `iso-furniture ${selected === item.id ? 'is-selected' : ''}`,
            onClick: () => onSelect?.(item.id),
            onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.(item.id);
              }
            },
          };
          if (item.kind === 'wardrobe') {
            return <g key={item.id} {...selectionProps}>
              <IsoWardrobe item={item} points={points} projectPoint={p} />
            </g>;
          }
          if (!['bed', 'rug'].includes(item.kind)) {
            return <g key={item.id} data-furniture={item.id} data-rotation={rotationOf(item)} {...selectionProps}>
              <IsoFurniture item={item} points={points} projectPoint={p} />
            </g>;
          }
          const r = footprint(item),
            x = r.x,
            y = r.y,
            x2 = x + r.width,
            y2 = y + r.depth;
          const z = item.kind === 'rug' ? 1 : 22;
          const c = colors[item.owner];
          const label = p((x + x2) / 2, (y + y2) / 2, z + 4);
          return (
            <g key={item.id} data-furniture={item.id} data-rotation={rotationOf(item)} {...selectionProps}>
              <polygon
                points={points([
                  [x, y2],
                  [x2, y2],
                  [x2, y2, z],
                  [x, y2, z],
                ])}
                fill={c.stroke}
                stroke={c.dark}
                strokeWidth=".6"
              />
              <polygon
                points={points([
                  [x2, y],
                  [x2, y2],
                  [x2, y2, z],
                  [x2, y, z],
                ])}
                fill={c.dark}
                stroke={c.dark}
                strokeWidth=".6"
                opacity=".7"
              />
              <polygon
                points={points([
                  [x, y, z],
                  [x2, y, z],
                  [x2, y2, z],
                  [x, y2, z],
                ])}
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth="1"
              />
              {item.kind === 'bed' && (
                <polygon
                  points={points([
                    furniturePoint(item, 10, 10, z + 2),
                    furniturePoint(item, item.width - 10, 10, z + 2),
                    furniturePoint(item, item.width - 10, item.depth * 0.23, z + 2),
                    furniturePoint(item, 10, item.depth * 0.23, z + 2),
                  ])}
                  fill="#fffdf9"
                  stroke={c.stroke}
                  strokeWidth=".6"
                />
              )}
              {item.kind !== 'rug' && (
                <text
                  x={label[0]}
                  y={label[1]}
                  textAnchor="middle"
                  fontSize={8.48}
                  fontWeight="600"
                  fill={c.dark}
                >
                  {t(item.name.split(' ')[0])}
                </text>
              )}
            </g>
          );
        })}
      {/* Cut-away front walls still have glazing in front of the furniture.
          Paint these last so chair backs cannot appear outside the window. */}
      {getOpenings(project.room).filter(isForeground).map(renderOpening)}
    </svg>
  );
}
