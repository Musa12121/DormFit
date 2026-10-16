import { t } from '../i18n';
import type { Furniture } from '../domain/model';
import { footprint } from '../domain/planner';
import { furniturePoint, rotationOf } from '../domain/rotation';

interface Props {
  item: Furniture;
  points: (vertices: number[][]) => string;
  projectPoint: (x: number, y: number, z?: number) => number[];
}

export default function IsoWardrobe({ item, points, projectPoint }: Props) {
  const r = footprint(item);
  const x2 = r.x + r.width, y2 = r.y + r.depth;
  const height = 105; // Illustrative height, not a vertical-fit calculation.
  const front = (u: number, z: number) => furniturePoint(item, item.width * u, item.depth, z);
  const frontPanel = (left: number, right: number, bottom: number, top: number) =>
    points([front(left, bottom), front(right, bottom), front(right, top), front(left, top)]);
  const side = [[x2, r.y, 0], [x2, y2, 0], [x2, y2, height], [x2, r.y, height]];
  const label = projectPoint(r.x + r.width / 2, r.y + r.depth / 2, height + 7);
  return (
    <g data-furniture={item.id} data-shape="iso-wardrobe" data-rotation={rotationOf(item)} role="img" aria-label={t(`${item.name}, two-door wardrobe`)}>
      <title>{t(item.name)}{t(": two doors, long handles and a wooden frame")}</title>
      <polygon points={points(side)} fill="#b58b63" stroke="#886342" strokeWidth=".8" />
      <polygon points={points([[r.x, y2, 0], [x2, y2, 0], [x2, y2, height], [r.x, y2, height]])} fill="#ccaa80" stroke="#886342" strokeWidth=".8" />
      <g visibility={[90, 180].includes(rotationOf(item)) ? 'hidden' : undefined}>
      <polygon points={frontPanel(0, 1, 0, height)} fill="#ccaa80" stroke="#886342" strokeWidth=".9" />
      {[0, 1].map((door) => (
        <g key={door} data-wardrobe-part="door">
          <polygon points={frontPanel(.035 + door * .48, .485 + door * .48, 7, height - 6)}
            fill={door === 0 ? '#ead3b3' : '#f1dec2'} stroke="#a58059" strokeWidth=".8" />
          <polygon points={frontPanel(.075 + door * .48, .445 + door * .48, 12, height - 11)}
            fill="none" stroke="#d0b28b" strokeWidth=".6" />
        </g>
      ))}
      {[.44, .56].map((u) => {
        const a = front(u, 46), b = front(u, 61);
        const start = projectPoint(a[0], a[1], a[2]), end = projectPoint(b[0], b[1], b[2]);
        return <line key={u} data-wardrobe-part="handle" x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]}
          stroke="#75583c" strokeWidth="2.2" strokeLinecap="round" />;
      })}
      <polygon points={frontPanel(0, 1, 0, 5)} fill="#96714c" stroke="#886342" strokeWidth=".6" />
      </g>
      <polygon points={points([[r.x, r.y, height], [x2, r.y, height], [x2, y2, height], [r.x, y2, height]])}
        fill="#e5c9a3" stroke="#a58059" strokeWidth="1" />
      <text x={label[0]} y={label[1]} textAnchor="middle" fontSize="8" fontWeight="600" fill="#785b40">{t("Wardrobe")}</text>
    </g>
  );
}
