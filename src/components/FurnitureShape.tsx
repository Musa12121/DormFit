import { t } from '../i18n';
import type { Furniture } from '../domain/model';
import { furnitureLabels, isBed } from '../domain/model';
import WardrobeShape from './WardrobeShape';
import ExtraFurnitureShape from './ExtraFurnitureShape';

export const colors = {
  a: { fill: '#dfe8f6', stroke: '#9aafd0', dark: '#5276af', light: '#edf2fa' },
  b: { fill: '#f3dfd1', stroke: '#cda88f', dark: '#ac7958', light: '#faf0e8' },
  shared: { fill: '#e8e4dc', stroke: '#bcb4a4', dark: '#8c8271', light: '#f5f2eb' },
};

export function FurnitureShape({ item, mini = false }: { item: Furniture; mini?: boolean }) {
  const w = item.width,
    h = item.depth,
    c = colors[item.owner];
  if (item.kind === 'rug')
    return (
      <g>
        <rect
          x="1"
          y="1"
          width={w - 2}
          height={h - 2}
          rx="6"
          fill="#e9e2d5"
          stroke="#d3c9b6"
          strokeWidth="1"
        />
        <rect
          x="8"
          y="8"
          width={w - 16}
          height={h - 16}
          rx="3"
          fill="none"
          stroke="#d9cfbe"
          strokeWidth="1"
        />
        {t(Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d={`M${15 + (i * (w - 30)) / 6} 13v${h - 26}`}
            stroke="#ded4c3"
            strokeWidth="0.7"
          />
        )))}
        <path
          d={`M${w / 2 - 15} ${h / 2}l15 -20 15 20 -15 20z`}
          fill="none"
          stroke="#cfc3ac"
          strokeWidth="1.2"
        />
      </g>
    );
  if (item.kind === 'plant')
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2 + 3} rx={w * 0.34} ry={h * 0.34} fill="#cfc2ad" />
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <ellipse
            key={angle}
            cx={w / 2}
            cy={h * 0.28}
            rx={w * 0.17}
            ry={h * 0.27}
            fill={i % 2 ? '#759c79' : '#8eaf8b'}
            stroke="#668b6c"
            strokeWidth="0.5"
            transform={`rotate(${angle} ${w / 2} ${h / 2})`}
          />
        ))}
        <circle cx={w / 2} cy={h / 2} r={w * 0.12} fill="#638c68" />
      </g>
    );
  if (isBed(item.kind))
    return (
      <g data-shape={item.kind}>
        <rect
          x="0"
          y="0"
          width={w}
          height={h}
          rx="6"
          fill="#d8c5ab"
          stroke="#bca58b"
          strokeWidth="1.4"
        />
        <rect
          x="4"
          y="6"
          width={w - 8}
          height={h - 10}
          rx="5"
          fill="#fefcf8"
          stroke="#d8d1c7"
          strokeWidth=".8"
        />
        <rect
          x="5"
          y={h * 0.27}
          width={w - 10}
          height={h * 0.7}
          rx="3"
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth=".7"
        />
        <rect
          x="5"
          y={h * 0.29}
          width={w - 10}
          height="15"
          fill={c.light}
          stroke={c.stroke}
          strokeWidth=".5"
        />
        <rect
          x={w * 0.18}
          y="13"
          width={w * 0.64}
          height={h * 0.15}
          rx="6"
          fill="#fffefb"
          stroke="#d8d1c7"
          strokeWidth=".9"
        />
        <path
          d={`M${w * 0.22} 17q${w * 0.28} 5 ${w * 0.56} 0`}
          fill="none"
          stroke="#ece8e2"
          strokeWidth="1"
        />
        {item.kind === 'double-bed' && <path data-bed-part="double-pillows" d={`M${w / 2} 13v${h * .15}`} stroke="#c5bdb0" strokeWidth="3" />}
        {item.kind === 'bunk-bed' && <g data-bed-part="ladder" stroke="#aa8c65" strokeWidth="2">
          <path d={`M${w * .78} ${h * .35}v${h * .55}M${w * .94} ${h * .35}v${h * .55}`} />
          {[.4, .5, .6, .7, .8].map(step => <path key={step} d={`M${w * .78} ${h * step}h${w * .16}`} />)}
        </g>}
        {!mini && (
          <>
            <path
              d={`M${w * 0.16} ${h * 0.56}v${h * 0.26}M${w * 0.84} ${h * 0.53}v${h * 0.3}`}
              stroke={c.stroke}
              opacity=".4"
              strokeWidth="1"
            />
            <text
              x={w / 2}
              y={h * 0.65}
              textAnchor="middle"
              fontSize="8"
              fill={c.dark}
              fontWeight="600"
            >
              {t(item.kind === 'bed' ? item.name.split(' ')[0] : furnitureLabels[item.kind])}
            </text>
          </>
        )}
      </g>
    );
  if (item.kind === 'desk')
    return (
      <g>
        <rect
          x="0"
          y="0"
          width={w}
          height={h * 0.73}
          rx="4"
          fill="#e7d3b5"
          stroke="#bfa17d"
          strokeWidth="1.1"
        />
        <rect x="3" y="3" width={w - 6} height={h * 0.73 - 6} rx="2" fill="#eee0cc" />
        <rect
          x={w * 0.35}
          y={h * 0.1}
          width={w * 0.3}
          height={h * 0.28}
          rx="2"
          fill="#4d5866"
          stroke="#354150"
          strokeWidth=".8"
        />
        <rect x={w * 0.37} y={h * 0.12} width={w * 0.26} height={h * 0.22} rx="1" fill="#b8c9d7" />
        <path
          d={`M${w * 0.31} ${h * 0.43}h${w * 0.38}l-4 -4h-${w * 0.31}z`}
          fill="#c2c7cb"
          stroke="#9ba3aa"
          strokeWidth=".7"
        />
        <rect
          x={w * 0.11}
          y={h * 0.17}
          width={w * 0.14}
          height={h * 0.32}
          rx="1"
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth=".7"
          transform={`rotate(-9 ${w * 0.18} ${h * 0.33})`}
        />
        <circle cx={w * 0.85} cy={h * 0.28} r="5" fill="#f9f8f3" stroke="#bca58b" />
        <rect
          x={w * 0.35}
          y={h * 0.73}
          width={w * 0.3}
          height={h * 0.25}
          rx="6"
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth="1"
        />
        <path d={`M${w * 0.38} ${h * 0.9}h${w * 0.24}`} stroke={c.stroke} />
      </g>
    );
  if (item.kind === 'shelf')
    return (
      <g>
        <rect width={w} height={h} rx="2" fill="#e3cfb0" stroke="#b89d7d" />
        {t(Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={5 + (i * (w - 12)) / 9}
            y="4"
            width={(w - 20) / 9}
            height={h - 8}
            rx=".7"
            fill={['#9bafbd', '#dcc7a8', '#b0b9a0', '#c6a28b'][i % 4]}
            stroke="#a69b89"
            strokeWidth=".5"
          />
        )))}
      </g>
    );
  if (item.kind === 'wardrobe') return <WardrobeShape width={w} depth={h} mini={mini} />;
  return <ExtraFurnitureShape item={item} />;
}
