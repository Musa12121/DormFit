import { t } from '../i18n';
import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Room, RoomOpening } from '../domain/model';
import { getOpenings, openingLabel, openingSegment, walls } from '../domain/openings';

export default function OpeningShapes({ room, mini = false, onMove, coordinate, onDragStart, onDragEnd }: {
  room: Room; mini?: boolean;
  onMove?: (id: string, x: number, y: number) => void;
  coordinate?: (event: PointerEvent) => { x: number; y: number };
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function start(event: PointerEvent<SVGGElement>, opening: RoomOpening) {
    if (!onMove || !coordinate || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = coordinate(event), segment = openingSegment(room, opening);
    drag.current = { id: opening.id, dx: point.x - segment.x - segment.width / 2, dy: point.y - segment.y - segment.depth / 2 };
    onDragStart?.();
  }
  function move(event: PointerEvent<SVGGElement>) {
    if (!drag.current || !coordinate) return;
    const point = coordinate(event);
    onMove?.(drag.current.id, point.x - drag.current.dx, point.y - drag.current.dy);
  }
  function end() {
    if (drag.current) { drag.current = null; onDragEnd?.(); }
  }
  function keyboard(event: KeyboardEvent<SVGGElement>, opening: RoomOpening) {
    if (!onMove) return;
    const step = event.shiftKey ? 10 : 5;
    let next = opening;
    if (event.key.toLowerCase() === 'r') next = { ...opening, wall: walls[(walls.indexOf(opening.wall) + 1) % walls.length] };
    else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      next = { ...opening, offset: opening.offset + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -step : step) };
    } else return;
    event.preventDefault(); event.stopPropagation(); onDragStart?.();
    const segment = openingSegment(room, next);
    onMove(opening.id, segment.x + segment.width / 2, segment.y + segment.depth / 2);
    onDragEnd?.();
  }
  return <g className="room-openings">
    {getOpenings(room).map((opening) => {
      const { offset, width, wall, kind } = opening;
      // Each opening uses a local horizontal axis; positive y points into the room.
      const transform = wall === 'top' ? `translate(${offset} 0)`
        : wall === 'bottom' ? `translate(${offset} ${room.depth}) scale(1 -1)`
          : wall === 'left' ? `translate(0 ${offset}) matrix(0 1 1 0 0 0)`
            : `translate(${room.width} ${offset}) matrix(0 1 -1 0 0 0)`;
      const label = openingLabel(room, opening);
      const labelX = wall === 'top' || wall === 'bottom' ? offset + width / 2 : wall === 'left' ? -18 : room.width + 18;
      const labelY = wall === 'left' || wall === 'right' ? offset + width / 2 : wall === 'top' ? -18 : room.depth + 20;
      return <g key={opening.id} data-opening={opening.id} data-wall={wall} data-opening-kind={kind}
        role={onMove ? 'button' : 'img'} tabIndex={onMove ? 0 : undefined}
        className={onMove ? 'draggable-opening' : undefined}
        aria-label={t(`${onMove ? 'Move ' : ''}${label}, ${wall} wall, ${width} cm wide, offset ${offset} cm`)}
        onPointerDown={(event) => start(event, opening)} onPointerMove={move} onPointerUp={end}
        onPointerCancel={end} onLostPointerCapture={end} onKeyDown={(event) => keyboard(event, opening)}>
        <title>{t(`${label}, ${wall} wall, ${width} cm wide, offset ${offset} cm`)}</title>
        <g transform={transform}>
        {kind === 'window' ? <>
          <rect x="0" y="-6" width={width} height="12" fill="#e4f0f5" stroke="#8eb8c7" strokeWidth="1.2" />
          <path d={`M0 0H${width}M${width / 2} -6V6`} stroke="#9cc0ce" />
        </> : <>
          <rect x="0" y="-5" width={width} height="10" fill="var(--plan-floor, #fcfbf8)" />
          <path data-door-part="swing" d={`M0 0v${width}a${width} ${width} 0 0 0 ${width} -${width}Z`} fill="#f59e0b" fillOpacity=".2" stroke="#d98408" strokeWidth="1.6" strokeDasharray="5 3" />
          <path data-door-part="frame" d={`M0 -5V5M${width} -5V5M0 0H${width}`} stroke="#d98408" strokeWidth="4" />
          <rect data-door-part="leaf" x="-3" y="0" width="6" height={width} rx="2" fill="#e8a23c" stroke="#ad620d" strokeWidth="1.5" />
          <circle cx="4" cy={width * .83} r="2.7" fill="#74430d" />
          <circle cx="0" cy="0" r="3.5" fill="#ad620d" />
        </>}
        {onMove && <path data-opening-handle={opening.id} d={`M0 0H${width}`} stroke="transparent" strokeWidth="24" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />}
        </g>
        {!mini && <text x={labelX} y={labelY} textAnchor="middle" fontSize="9" fontWeight={kind === 'door' ? 800 : 600} fill={kind === 'door' ? '#b97319' : '#8999ad'}
          transform={wall === 'left' || wall === 'right' ? `rotate(-90 ${labelX} ${labelY})` : undefined}>{t(label.toUpperCase())}</text>}
      </g>;
    })}
  </g>;
}
