import type { Furniture } from '../domain/model';
import { furnitureLabels } from '../domain/model';
import { t } from '../i18n';
import { furniturePoint, rotationOf } from '../domain/rotation';

interface Props {
  item: Furniture;
  points: (vertices: number[][]) => string;
  projectPoint: (x: number, y: number, z?: number) => number[];
}

// Heights here are illustrations. Only the measured floor footprint is used for fitting.
export default function IsoFurniture({ item, points, projectPoint }: Props) {
  const { kind } = item;
  const metal = ['fridge', 'washing-machine', 'office-chair', 'television', 'floor-lamp'].includes(kind);
  const outline = metal ? '#758594' : '#917456';
  // Work in the item's unrotated coordinate system so details rotate with the footprint.
  const at = (u: number, v: number, z: number) => furniturePoint(item, item.width * u, item.depth * v, z);
  const box = (u: number, v: number, width: number, depth: number, bottom: number, top: number,
    fill = '#e6d1b3', side = '#bb9870') => {
      const corners = [at(u, v, top), at(u + width, v, top), at(u + width, v + depth, top), at(u, v + depth, top)];
      const left = Math.min(...corners.map(point => point[0])), right = Math.max(...corners.map(point => point[0]));
      const back = Math.min(...corners.map(point => point[1])), front = Math.max(...corners.map(point => point[1]));
      return <g>
        <polygon points={points([[left, front, bottom], [right, front, bottom], [right, front, top], [left, front, top]])} fill={side} stroke={outline} strokeWidth=".6" />
        <polygon points={points([[right, back, bottom], [right, front, bottom], [right, front, top], [right, back, top]])} fill={side} stroke={outline} strokeWidth=".6" />
        <polygon points={points(corners)} fill={fill} stroke={outline} strokeWidth=".6" />
      </g>;
    };
  const line = (a: number[], b: number[], stroke = '#8a7359', strokeWidth = 2) =>
    <path d={`M${projectPoint(a[0], a[1], a[2]).join(' ')}L${projectPoint(b[0], b[1], b[2]).join(' ')}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />;
  const frontCircle = (u: number, z: number, radius: number, height: number, fill: string, stroke = outline) =>
    <polygon points={points(Array.from({ length: 32 }, (_, i) => {
      const angle = i * Math.PI / 16;
      return at(u + Math.cos(angle) * radius, 1, z + Math.sin(angle) * height);
    }))} fill={fill} stroke={stroke} strokeWidth="1" />;
  const frontPanel = (u: number, z: number, width: number, height: number, fill: string) =>
    <polygon points={points([at(u, 1, z), at(u + width, 1, z), at(u + width, 1, z + height), at(u, 1, z + height)])} fill={fill} stroke={outline} strokeWidth=".6" />;
  let drawing, height = 40;
  if (kind === 'desk') {
    height = 84;
    const accessories = [
      { key: 'keyboard', centre: at(.48, .73, 0), drawing: <g data-furniture-part="keyboard">
        {box(.28, .65, .4, .16, 46.5, 48, '#c7d0d8', '#8799a8')}
        {[.69, .73, .77].map(v => <g key={v}>{line(at(.31, v, 48.2), at(.65, v, 48.2), '#788d9d', .65)}</g>)}
        {box(.79, .68, .07, .1, 46.5, 48.5, '#a8bac7', '#7c91a1')}
      </g> },
      { key: 'monitor', centre: at(.5, .22, 0), drawing: <g data-furniture-part="monitor">
        {box(.39, .23, .22, .25, 46, 48, '#657d8f', '#455b6b')}
        {box(.47, .25, .06, .1, 48, 56, '#596e80', '#455b6b')}
        {box(.25, .2, .52, .04, 56, 84, '#465c70', '#283e52')}
        {[0, 270].includes(rotationOf(item)) && <polygon data-furniture-part="monitor-screen"
          points={points([at(.28, .245, 58), at(.74, .245, 58), at(.74, .245, 82), at(.28, .245, 82)])}
          fill="#93b6ce" stroke="#314a5d" strokeWidth=".5" />}
      </g> },
    ].sort((a, b) => a.centre[0] + a.centre[1] - b.centre[0] - b.centre[1]);
    drawing = <>
      {[.06, .86].flatMap(u => [.06, .86].map(v => <g key={`${u}-${v}`}>{box(u, v, .08, .08, 0, 42)}</g>))}
      {box(.02, .02, .96, .96, 42, 46)}
      {accessories.map(part => <g key={part.key} data-desk-accessory={part.key}>{part.drawing}</g>)}
    </>;
  } else if (kind === 'shelf') {
    height = 105;
    const shelfLevels = [4, 36, 68, 100];
    const books = [
      { width: .11, height: 20, color: '#7893a8' },
      { width: .13, height: 24, color: '#c38e70' },
      { width: .10, height: 18, color: '#91a27e' },
      { width: .14, height: 26, color: '#d0b278' },
      { width: .12, height: 22, color: '#9b8294' },
    ];
    drawing = <g data-shelf-part="bookcase">
      {box(.02, .03, .96, .05, 0, height, '#cfb18a', '#b9956a')}
      {box(.02, .03, .06, .94, 0, height)}
      {box(.92, .03, .06, .94, 0, height)}
      {shelfLevels.map((z, shelfIndex) => <g key={z}>
        {box(.04, .03, .92, .94, z, z + 4)}
        {z < 100 && books.map((book, index) => {
          const u = .16 + books.slice(0, index).reduce((sum, previous) => sum + previous.width, 0);
          const bottom = z + 4;
          return <g key={`${z}-${index}`} data-shelf-part="book-spine">
            {frontPanel(u, bottom, book.width, book.height - (shelfIndex + index) % 3 * 2, book.color)}
            {line(at(u + book.width * .2, 1, bottom + 3), at(u + book.width * .8, 1, bottom + 3), '#f0dfc7', .7)}
          </g>;
        })}
      </g>)}
    </g>;
  } else if (kind === 'plant') {
    height = 46;
    const ring = (radius: number, z: number) => Array.from({ length: 24 }, (_, i) => at(.5 + Math.cos(i * Math.PI / 12) * radius, .5 + Math.sin(i * Math.PI / 12) * radius, z));
    const base = ring(.23, 0), rim = ring(.36, 21);
    drawing = <g data-furniture-part="leaves">
      {rim.map((point, i) => <polygon key={i} points={points([base[i], base[(i + 1) % 24], rim[(i + 1) % 24], point])} fill={i < 12 ? '#c8946e' : '#ae7c58'} stroke="#9f7355" strokeWidth=".25" />)}
      <polygon points={points(rim)} fill="#73604d" stroke="#b28361" />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = i * Math.PI / 3;
        return <polygon key={i} points={points([at(.5, .5, 22), at(.5 + Math.cos(angle - .35) * .36, .5 + Math.sin(angle - .35) * .36, 35),
          at(.5 + Math.cos(angle) * .46, .5 + Math.sin(angle) * .46, 44), at(.5 + Math.cos(angle + .35) * .26, .5 + Math.sin(angle + .35) * .26, 40)])}
          fill={i % 2 ? '#81a77e' : '#5e8a63'} stroke="#4f7653" strokeWidth=".5" />;
      })}
    </g>;
  } else if (kind === 'fridge') {
    height = 108;
    drawing = <g data-furniture-part="fridge-doors">
      {box(.02, .02, .96, .96, 3, height, '#eef3f6', '#c5cfd7')}
      {frontPanel(.06, 7, .88, 65, '#f6f9fa')}{frontPanel(.06, 75, .88, 29, '#e5edf2')}
      {line(at(.16, 1, 54), at(.16, 1, 68), '#667c8e', 3)}
      {line(at(.16, 1, 84), at(.16, 1, 98), '#667c8e', 3)}
    </g>;
  } else if (kind === 'washing-machine') {
    height = 56;
    drawing = <g data-furniture-part="drum">
      {box(.02, .02, .96, .96, 2, height, '#f0f4f7', '#c7d1d8')}
      {frontPanel(.05, 46, .9, 8, '#e4eaf0')}
      {frontPanel(.1, 48, .25, 4, '#a8bac9')}{frontCircle(.82, 50, .045, 2.3, '#647c8f')}
      {frontCircle(.5, 25, .33, 18, '#becbd5')}{frontCircle(.5, 25, .26, 14.5, '#4b6982')}
      {frontCircle(.46, 29, .13, 6, '#86acc5')}{frontCircle(.82, 25, .035, 3.5, '#6b8091')}
    </g>;
  } else if (kind === 'television') {
    height = 74;
    const bottom = 22;
    const back = .08;
    const front = back + .14;
    drawing = <g data-furniture-part="wall-mount">
      {box(.4, 0, .2, .08, 40, 55, '#455b6d', '#34495a')}
      {box(.02, back, .96, .13, bottom, height, '#344c63', '#253a4e')}
      <polygon data-furniture-part="screen" points={points([at(.06, front, bottom + 4), at(.94, front, bottom + 4), at(.94, front, height - 4), at(.06, front, height - 4)])} fill="#678da8" stroke="#182d40" />
    </g>;
  } else if (kind === 'floor-lamp') {
    height = 96;
    const circle = (radius: number, z: number) => Array.from({ length: 32 }, (_, i) => at(.5 + Math.cos(i * Math.PI / 16) * radius, .5 + Math.sin(i * Math.PI / 16) * radius, z));
    const base = circle(.46, 2), bottom = circle(.48, 77), top = circle(.29, height);
    drawing = <g data-furniture-part="lamp-shade">
      <polygon points={points(base)} fill="#6b7d8c" stroke={outline} />
      {line(at(.5, .5, 2), at(.5, .5, 82), '#677a8a', 3)}
      {bottom.map((point, i) => <polygon key={i} points={points([point, bottom[(i + 1) % 32], top[(i + 1) % 32], top[i]])} fill={i < 16 ? '#f0dba9' : '#dcc38c'} stroke="#c5ac74" strokeWidth=".2" />)}
      <polygon points={points(top)} fill="#fff4ce" stroke="#bda36c" />
    </g>;
  } else if (kind === 'storage-box') {
    height = 26;
    drawing = <>
      {box(.04, .04, .92, .92, 1, 23, '#dfc39d', '#bb9b73')}
      {box(.01, .01, .98, .98, 23, 26, '#eed8b7', '#c8ab84')}
      {frontPanel(.33, 11, .34, 5, '#7d674e')}
    </>;
  } else if (kind === 'office-chair') {
    height = 64;
    drawing = <g data-furniture-part="wheels">
      {[.08, .85].flatMap(u => [.08, .85].map(v => <g key={`${u}-${v}`}>
        {line(at(.5, .5, 6), at(u, v, 4), '#607487', 2)}{box(u, v, .07, .07, 0, 5, '#31485b', '#24394b')}
      </g>))}
      {box(.45, .45, .1, .1, 5, 27, '#7790a4', '#597183')}
      {box(.15, .2, .7, .68, 27, 33, '#667f93', '#415c72')}
      {box(.18, .12, .64, .12, 33, 64, '#506c83', '#344e64')}
      {box(.07, .55, .04, .06, 33, 40, '#526c80', '#344e64')}{box(.89, .55, .04, .06, 33, 40, '#526c80', '#344e64')}
      {box(.04, .3, .09, .5, 40, 44, '#425b70', '#30485c')}{box(.87, .3, .09, .5, 40, 44, '#425b70', '#30485c')}
    </g>;
  } else if (kind === 'double-bed' || kind === 'bunk-bed') {
    const levels = kind === 'bunk-bed' ? [20, 88] : [24]; height = levels.at(-1)!;
    drawing = <>
      {levels.map(z => <g key={z} data-bed-part="mattress">
        {box(0, 0, 1, 1, z - 10, z, '#cad7e6', '#a7b8cd')}
        {kind === 'double-bed' ? [0.06, .53].map(u => <g key={u}>{box(u, .04, .4, .18, z, z + 4, '#fffaf0')}</g>) : box(.08, .04, .84, .18, z, z + 4, '#fffaf0')}
      </g>)}
      {kind === 'bunk-bed' && <g data-bed-part="ladder">
        {[.05, .95].flatMap(u => [.03, .97].map(v => <g key={`${u}-${v}`}>{line(at(u, v, 0), at(u, v, 100))}</g>))}
        {line(at(.75, 1, 0), at(.75, 1, 96))}{line(at(.95, 1, 0), at(.95, 1, 96))}
        {[15, 30, 45, 60, 75, 90].map(z => <g key={z}>{line(at(.75, 1, z), at(.95, 1, z))}</g>)}
      </g>}
    </>;
  } else if (kind === 'chair') {
    height = 61;
    drawing = <>
      {[.08, .84].flatMap(u => [.08, .84].map(v => <g key={`${u}-${v}`}>{box(u, v, .08, .08, 0, 28)}</g>))}
      {box(.05, .05, .9, .9, 26, 30)}
      {box(.08, .04, .08, .08, 28, 61)}{box(.84, .04, .08, .08, 28, 61)}
      {box(.08, .04, .84, .09, 47, 61)}
    </>;
  } else if (kind === 'sofa' || kind === 'armchair') {
    height = 58;
    const seats = kind === 'sofa' ? 3 : 1;
    const parts = [
      { key: 'sofa-back', centre: at(.5, .11, 0), drawing: box(.04, .02, .92, .18, 22, 58, '#d9e4e9', '#9baeba') },
      ...Array.from({ length: seats }, (_, i) => ({ key: `sofa-cushion-${i}`,
        centre: at(.15 + .7 * (i + .5) / seats, .55, 0),
        drawing: box(.15 + .7 * i / seats, .24, .68 / seats, .63, 22, 30, '#dce6e9', '#a5b9c2') })),
      { key: 'sofa-arm-left', centre: at(.08, .57, 0), drawing: box(.02, .18, .12, .78, 22, 42, '#c0d0d9') },
      { key: 'sofa-arm-right', centre: at(.92, .57, 0), drawing: box(.86, .18, .12, .78, 22, 42, '#c0d0d9') },
    ].sort((a, b) => a.centre[0] + a.centre[1] - b.centre[0] - b.centre[1]);
    drawing = <>
      {box(.04, .04, .92, .92, 9, 22, '#a6bac7', '#8da3b1')}
      {parts.map(part => <g key={part.key} data-furniture-part={part.key}>{part.drawing}</g>)}
    </>;
  } else if (['coffee-table', 'dining-table', 'side-table', 'bench', 'stool', 'vanity'].includes(kind)) {
    height = ['coffee-table', 'side-table', 'bench', 'stool'].includes(kind) ? 30 : 46;
    drawing = <>
      {[.07, .85].flatMap(u => [.07, .85].map(v => <g key={`${u}-${v}`}>{box(u, v, .08, .08, 0, height - 4)}</g>))}
      {box(.02, .02, .96, .96, height - 4, height)}
      {kind === 'dining-table' && [.25, .75].flatMap(u => [.25, .75].map(v => {
        const radius = Math.min(11, item.width * .18, item.depth * .18);
        const ring = (r: number) => points(Array.from({ length: 32 }, (_, index) => {
          const angle = index * Math.PI / 16;
          return at(u + Math.cos(angle) * r / item.width, v + Math.sin(angle) * r / item.depth, height + .5);
        }));
        return <g key={`${u}-${v}`} data-furniture-part="plate">
          <polygon points={ring(radius)} fill="#fffaf0" stroke="#cbbda9" strokeWidth=".6" />
          <polygon points={ring(radius * .68)} fill="none" stroke="#dcd2c4" strokeWidth=".5" />
        </g>;
      }))}
      {kind === 'vanity' && box(.17, .04, .66, .04, height, height + 43, '#cce0e6', '#d9bd97')}
    </>;
    if (kind === 'vanity') height += 43;
  } else if (kind === 'shoe-rack') {
    height = 40;
    drawing = <>
      {[.02, .92].flatMap(u => [.02, .92].map(v => <g key={`${u}-${v}`}>{box(u, v, .06, .06, 0, height)}</g>))}
      {[5, 22].map(z => <g key={z}>
        {box(.02, .02, .96, .96, z, z + 3)}
        {[.12, .35, .58, .81].map(u => <g key={u}>{box(u, .2, .12, .6, z + 3, z + 9, '#abbecb', '#7a919f')}</g>)}
      </g>)}
    </>;
  } else if (kind === 'clothes-rack') {
    height = 96;
    drawing = <>
      {[.04, .94].map(u => <g key={u}>{box(u, .05, .04, .9, 0, 4)}{box(u, .48, .04, .04, 0, height)}</g>)}
      {box(.04, .47, .94, .06, height - 3, height)}
      {[.15, .38, .61].map((u, i) => <g key={u} data-rack-part="clothes">{box(u, .42, .19, .14, 28, 82, ['#a9c0d1', '#d7b9a6', '#b2c5a7'][i])}</g>)}
    </>;
  } else {
    height = kind === 'nightstand' ? 30 : kind === 'ottoman' ? 25 : kind === 'tv-stand' ? 28 : 58;
    drawing = <>
      {box(.02, .02, .96, .96, 3, height, kind === 'ottoman' ? '#c7d5de' : '#e6d1b3')}
      {kind === 'cabinet' ? <>
        {line(at(.5, .99, 5), at(.5, .99, height - 2), '#a68a69', 1)}
        {line(at(.43, 1, height * .45), at(.43, 1, height * .6))}
        {line(at(.57, 1, height * .45), at(.57, 1, height * .6))}
      </> : kind === 'ottoman' ? box(.05, .05, .9, .9, height, height + 4, '#e0e7eb')
        : [0.3, .65].map(fraction => <g key={fraction}>{line(at(.06, .99, height * fraction), at(.94, .99, height * fraction), '#a68a69', 1)}</g>)}
      {kind === 'tv-stand' && <>{box(.15, .34, .7, .07, height + 4, height + 47, '#374656', '#273340')}{box(.4, .3, .2, .3, height, height + 4)}</>}
      {kind === 'nightstand' && <g data-furniture-part="bedside-lamp">
        {box(.56, .5, .3, .3, height, height + 2, '#c5a96f', '#9c8555')}
        {line(at(.7, .65, height + 2), at(.7, .65, height + 25), '#9c8555', 2)}
        {box(.48, .43, .44, .44, height + 16, height + 29, '#fff1c7', '#d7bd88')}
      </g>}
    </>;
    if (kind === 'tv-stand') height += 47;
    if (kind === 'nightstand') height += 29;
  }
  const label = at(.5, .5, height + 8);
  const position = projectPoint(label[0], label[1], label[2]);
  return <g data-shape={`iso-${kind}`} data-rotation={rotationOf(item)}>
    {drawing}
    <text x={position[0]} y={position[1]} textAnchor="middle" fontSize={8.48} fontWeight="600" fill="#6d5c47">{t(kind === 'shelf' ? 'Shelf' : furnitureLabels[kind])}</text>
  </g>;
}
