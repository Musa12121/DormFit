import type { Furniture } from '../domain/model';
import { furnitureLabels } from '../domain/model';
import { t } from '../i18n';

// Draw in a 100 × 100 square, then scale to the item's real floor measurements.
export default function ExtraFurnitureShape({ item }: { item: Furniture }) {
  const kind = item.kind;
  const wood = '#e5cfb0', edge = '#a88a64', fabric = '#c9d6de', seam = '#8b9ea9';
  let drawing;
  if (kind === 'sofa' || kind === 'armchair') {
    const seats = kind === 'sofa' ? 3 : 1;
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="9" fill={fabric} stroke={seam} />
      <rect x="9" y="6" width="82" height="22" rx="6" fill="#dce5e9" stroke={seam} />
      {Array.from({ length: seats }, (_, i) => <rect key={i} x={13 + i * 74 / seats} y="31" width={72 / seats} height="56" rx="5" fill="#e4ebed" stroke={seam} />)}
      {[3, 87].map(x => <rect key={x} x={x} y="22" width="10" height="68" rx="4" fill={fabric} stroke={seam} />)}
    </>;
  } else if (kind === 'office-chair') {
    drawing = <g data-furniture-part="wheels">
      <path d="M50 52V94M50 76L12 90M50 76L88 90M50 76L20 60M50 76L80 60" stroke="#687786" strokeWidth="5" />
      {[[12, 90], [88, 90], [20, 60], [80, 60], [50, 94]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 4} y={y - 3} width="8" height="6" rx="2" fill="#344454" />)}
      <rect x="18" y="4" width="64" height="22" rx="9" fill="#42586d" stroke="#283c4f" strokeWidth="2" />
      <rect x="20" y="29" width="60" height="46" rx="12" fill="#657f94" stroke="#354f65" strokeWidth="2" />
      <rect x="8" y="29" width="8" height="37" rx="4" fill="#344b5d" /><rect x="84" y="29" width="8" height="37" rx="4" fill="#344b5d" />
    </g>;
  } else if (kind === 'television') {
    drawing = <>
      <rect x="2" y="3" width="96" height="94" rx="3" fill="#e1e6e9" stroke="#7e8d99" />
      <path d="M25 72L15 94M75 72L85 94" stroke="#354957" strokeWidth="6" />
      <rect x="5" y="28" width="90" height="26" rx="3" fill="#283b50" stroke="#172535" strokeWidth="2" />
      <path d="M11 33H89" stroke="#6f8ba2" strokeWidth="2" />
    </>;
  } else if (kind === 'fridge') {
    drawing = <g data-furniture-part="fridge-door">
      <rect x="3" y="2" width="94" height="96" rx="6" fill="#e9eef1" stroke="#8595a2" strokeWidth="2" />
      <rect x="9" y="7" width="82" height="72" rx="3" fill="#f6f9fa" stroke="#c4cfd6" />
      <path d="M5 83H95" stroke="#879aa8" strokeWidth="2" />
      <rect x="15" y="87" width="40" height="5" rx="2" fill="#697c8c" />
      <path d="M65 13h19M65 18h19M65 23h19" stroke="#c0cbd3" />
    </g>;
  } else if (kind === 'washing-machine') {
    drawing = <g data-furniture-part="drum">
      <rect x="3" y="2" width="94" height="96" rx="5" fill="#f0f3f5" stroke="#8798a4" strokeWidth="2" />
      <rect x="8" y="7" width="84" height="14" rx="2" fill="#dce3e8" />
      <rect x="14" y="11" width="22" height="6" rx="1" fill="#b8c7d2" /><circle cx="80" cy="14" r="4" fill="#647d91" />
      <circle cx="50" cy="57" r="30" fill="#c2ced7" stroke="#7c8d99" strokeWidth="3" />
      <circle cx="50" cy="57" r="23" fill="#536e85" stroke="#253f54" strokeWidth="2" />
      <path d="M31 60q11 -12 22 0t17 -1" fill="none" stroke="#a9d4ea" strokeWidth="4" />
      <path d="M32 42q8 -8 17 -7" fill="none" stroke="#d0e8f4" strokeWidth="3" />
      <rect x="77" y="51" width="7" height="12" rx="2" fill="#718595" />
    </g>;
  } else if (kind === 'storage-box') {
    drawing = <>
      <rect x="4" y="4" width="92" height="92" rx="7" fill="#d0b28a" stroke="#917451" strokeWidth="2" />
      <rect x="2" y="2" width="96" height="85" rx="6" fill="#e7cfac" stroke="#a28765" strokeWidth="2" />
      <rect x="8" y="9" width="84" height="67" rx="4" fill="none" stroke="#c4a580" />
      <rect x="34" y="86" width="32" height="7" rx="3" fill="#8f7659" />
      <path d="M13 24V49M87 24V49" stroke="#b99c77" strokeWidth="3" />
    </>;
  } else if (kind === 'floor-lamp') {
    drawing = <g data-furniture-part="lamp-shade">
      <circle cx="50" cy="50" r="46" fill="#f7e6b9" fillOpacity=".75" stroke="#bea56b" strokeWidth="2" />
      <circle cx="50" cy="50" r="31" fill="#fff8dc" stroke="#e0cd9e" strokeWidth="2" />
      <path d="M18 18L44 44M82 18L56 44M18 82L44 56M82 82L56 56" stroke="#d3bd8c" />
      <circle cx="50" cy="50" r="9" fill="#d1b570" stroke="#9f854b" />
    </g>;
  } else if (kind === 'chair') {
    drawing = <>
      <path d="M17 25V92M83 25V92" stroke={edge} strokeWidth="7" />
      <rect x="9" y="5" width="82" height="23" rx="7" fill={wood} stroke={edge} />
      <rect x="12" y="33" width="76" height="58" rx="7" fill={wood} stroke={edge} />
      <path d="M22 76H78" stroke="#cfb18c" />
    </>;
  } else if (kind === 'stool' || kind === 'ottoman') {
    drawing = kind === 'stool' ? <>
      <circle cx="50" cy="50" r="46" fill={wood} stroke={edge} strokeWidth="2" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="#c8ac86" />
      {[25, 75].map(x => <circle key={x} cx={x} cy="50" r="3" fill={edge} />)}
    </> : <>
      <rect x="3" y="3" width="94" height="94" rx="22" fill={fabric} stroke={seam} strokeWidth="2" />
      <path d="M15 50H85M50 15V85" stroke={seam} />
      {[28, 72].flatMap(x => [28, 72].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={seam} />))}
    </>;
  } else if (kind === 'bench') {
    drawing = <>
      <rect x="3" y="6" width="94" height="88" rx="4" fill={wood} stroke={edge} strokeWidth="2" />
      {[28, 50, 72].map(y => <path key={y} d={`M8 ${y}H92`} stroke={edge} />)}
      {[12, 88].flatMap(x => [15, 85].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill={edge} />))}
    </>;
  } else if (['nightstand', 'dresser', 'cabinet'].includes(kind)) {
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="3" fill={wood} stroke={edge} strokeWidth="2" />
      <rect x="7" y="7" width="86" height="77" rx="2" fill="#efddc4" stroke="#c8aa83" />
      <path d="M3 87H97M40 92H60" stroke={edge} strokeWidth="2" />
      {kind === 'cabinet' && <path d="M50 87V98M42 93h3M55 93h3" stroke={edge} strokeWidth="2" />}
      {kind === 'nightstand' && <><circle cx="65" cy="65" r="20" fill="#fff7d9" stroke={edge} /><circle cx="65" cy="65" r="6" fill="#d5b87c" /></>}
    </>;
  } else if (kind === 'shoe-rack') {
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="3" fill={wood} stroke={edge} strokeWidth="2" />
      <path d="M4 50H96" stroke={edge} strokeWidth="3" />
      {[15, 57].flatMap(x => [10, 55].map(y => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
        <rect width="12" height="33" rx="5" fill="#a0b0bc" stroke="#778a98" /><rect x="15" width="12" height="33" rx="5" fill="#a0b0bc" stroke="#778a98" />
      </g>))}
    </>;
  } else if (kind === 'clothes-rack') {
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="3" fill="#f1ece2" stroke="#d6cbba" />
      <path d="M9 9V91M91 9V91M9 28H91M2 9H16M84 9H98M2 91H16M84 91H98" stroke="#727f89" strokeWidth="4" />
      {[22, 42, 62, 82].map((x, i) => <path key={x} d={`M${x} 28v12l-8 25h16l-8 -25`} fill={['#b7c9d5', '#dabbaa', '#b9c8ae', '#ddd1b9'][i]} stroke="#87939b" strokeWidth="1.5" />)}
    </>;
  } else if (kind === 'tv-stand') {
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="3" fill={wood} stroke={edge} />
      <path d="M33 60V96M67 60V96M3 60H97" stroke={edge} />
      <path d="M35 70H45M55 70H65" stroke={edge} strokeWidth="3" />
      <path d="M25 48H75M40 30L32 48M60 30L68 48" stroke="#586575" strokeWidth="4" />
      <rect x="10" y="12" width="80" height="13" rx="2" fill="#3a4655" stroke="#273240" />
    </>;
  } else if (kind === 'vanity') {
    drawing = <>
      <rect x="2" y="2" width="96" height="96" rx="5" fill={wood} stroke={edge} />
      <ellipse cx="50" cy="25" rx="31" ry="18" fill="#cce0e6" stroke={edge} strokeWidth="3" />
      <path d="M35 30L59 16" stroke="#f5fbff" strokeWidth="3" />
      <rect x="8" y="55" width="84" height="36" rx="3" fill="#efddc4" stroke={edge} />
      <circle cx="20" cy="68" r="6" fill="#c9b7d5" /><circle cx="79" cy="70" r="5" fill="#f3d4ba" />
    </>;
  } else {
    // Tables have visible legs and a top surface; dining chairs are separate items.
    drawing = <>
      {[15, 85].flatMap(x => [15, 85].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" fill={edge} />))}
      {kind === 'side-table' ? <ellipse cx="50" cy="50" rx="47" ry="47" fill={wood} stroke={edge} strokeWidth="2" />
        : <rect x="2" y="2" width="96" height="96" rx={kind === 'coffee-table' ? 14 : 5} fill={wood} stroke={edge} strokeWidth="2" />}
      {kind === 'dining-table' ? [25, 75].map(x => <g key={x}><circle cx={x} cy="50" r="17" fill="#fffaf0" stroke="#cbbda9" /><circle cx={x} cy="50" r="11" fill="none" stroke="#dcd2c4" /></g>)
        : <><rect x="24" y="30" width="30" height="39" rx="2" fill="#9bafbd" transform="rotate(-8 39 50)" /><circle cx="72" cy="56" r="10" fill="#fffaf0" stroke={edge} /></>}
    </>;
  }
  return <g data-shape={kind} role="img" aria-label={t(furnitureLabels[kind])}>
    <g transform={`scale(${item.width / 100} ${item.depth / 100})`}>{drawing}</g>
  </g>;
}
