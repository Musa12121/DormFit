import type { Furniture } from '../domain/model';
import { furnitureLabels } from '../domain/model';
import { t } from '../i18n';

interface Props {
  item: Furniture;
  points: (vertices: number[][]) => string;
  projectPoint: (x: number, y: number, z?: number) => number[];
}

// Heights here are illustrations. Only the measured floor footprint is used for fitting.
export default function IsoFurniture({ item, points, projectPoint }: Props) {
  const { kind, x, y } = item;
  const metal = ['fridge', 'washing-machine', 'office-chair', 'television', 'floor-lamp'].includes(kind);
  const outline = metal ? '#758594' : '#917456';
  // Work in the item's unrotated coordinate system so details rotate with the footprint.
  const at = (u: number, v: number, z: number) => item.rotated
    ? [x + item.depth * (1 - v), y + item.width * u, z]
    : [x + item.width * u, y + item.depth * v, z];
  const box = (u: number, v: number, width: number, depth: number, bottom: number, top: number,
    fill = '#e6d1b3', side = '#bb9870') => <g>
    <polygon points={points([at(u, v + depth, bottom), at(u + width, v + depth, bottom), at(u + width, v + depth, top), at(u, v + depth, top)])} fill={side} stroke={outline} strokeWidth=".6" />
    <polygon points={points([at(u + width, v, bottom), at(u + width, v + depth, bottom), at(u + width, v + depth, top), at(u + width, v, top)])} fill={side} stroke={outline} strokeWidth=".6" />
    <polygon points={points([at(u, v, top), at(u + width, v, top), at(u + width, v + depth, top), at(u, v + depth, top)])} fill={fill} stroke={outline} strokeWidth=".6" />
  </g>;
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
    height = 46;
    drawing = <>
      {[.06, .86].flatMap(u => [.06, .62].map(v => <g key={`${u}-${v}`}>{box(u, v, .08, .08, 0, 42)}</g>))}
      {box(.02, .02, .96, .72, 42, 46)}
      {box(.47, .3, .07, .15, 46, 55, '#596e80', '#455b6b')}
      {box(.3, .19, .42, .05, 55, 73, '#465c70', '#283e52')}
      <polygon points={points([at(.32, .245, 57), at(.7, .245, 57), at(.7, .245, 71), at(.32, .245, 71)])} fill="#93b6ce" stroke="#314a5d" strokeWidth=".5" />
      {box(.35, .5, .32, .12, 46, 48, '#b6c4ce', '#8b9eac')}
      {box(.35, .79, .3, .2, 20, 25, '#b9cbd9', '#829bad')}
      {[.37, .59].flatMap(u => [.81, .94].map(v => <g key={`${u}-${v}`}>{box(u, v, .04, .04, 0, 20)}</g>))}
      {box(.35, .96, .3, .03, 25, 40, '#b9cbd9', '#829bad')}
    </>;
    height = 73;
  } else if (kind === 'shelf') {
    height = 105;
    drawing = <>
      {box(.02, .03, .96, .05, 0, height, '#cfb18a', '#b9956a')}
      {box(.02, .03, .06, .94, 0, height)}{box(.92, .03, .06, .94, 0, height)}
      {[4, 36, 68, 100].map(z => <g key={z}>
        {box(.04, .03, .92, .94, z, z + 4)}
        {z < 100 && [.14, .29, .44, .63, .78].map((u, i) => <g key={u}>{box(u, .25, .1, .7, z + 4, z + 25 - i % 3 * 3, ['#8aa2b5', '#d0aa89', '#9ead8b'][i % 3])}</g>)}
      </g>)}
    </>;
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
    height = 66;
    drawing = <>
      {box(.08, .3, .08, .6, 0, 5, '#455b6d', '#34495a')}{box(.84, .3, .08, .6, 0, 5, '#455b6d', '#34495a')}
      {box(.02, .35, .96, .13, 7, height, '#344c63', '#253a4e')}
      <polygon data-furniture-part="screen" points={points([at(.06, .49, 11), at(.94, .49, 11), at(.94, .49, 62), at(.06, .49, 62)])} fill="#678da8" stroke="#182d40" />
    </>;
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
    drawing = <>
      {box(.04, .04, .92, .92, 9, 22, '#a6bac7', '#8da3b1')}
      {box(.04, .02, .92, .18, 22, 58, '#d9e4e9', '#9baeba')}
      {Array.from({ length: seats }, (_, i) => <g key={i}>{box(.15 + .7 * i / seats, .24, .68 / seats, .63, 22, 30, '#dce6e9', '#a5b9c2')}</g>)}
      {box(.02, .18, .12, .78, 22, 42, '#c0d0d9')}{box(.86, .18, .12, .78, 22, 42, '#c0d0d9')}
    </>;
  } else if (['coffee-table', 'dining-table', 'side-table', 'bench', 'stool', 'vanity'].includes(kind)) {
    height = ['coffee-table', 'side-table', 'bench', 'stool'].includes(kind) ? 30 : 46;
    drawing = <>
      {[.07, .85].flatMap(u => [.07, .85].map(v => <g key={`${u}-${v}`}>{box(u, v, .08, .08, 0, height - 4)}</g>))}
      {box(.02, .02, .96, .96, height - 4, height)}
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
  return <g data-shape={`iso-${kind}`}>
    {drawing}
    <text x={position[0]} y={position[1]} textAnchor="middle" fontSize="8" fontWeight="600" fill="#6d5c47">{t(kind === 'shelf' ? 'Shelf' : furnitureLabels[kind])}</text>
  </g>;
}
