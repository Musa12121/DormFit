import { t } from '../i18n';
import { useId, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Furniture, Project, Room } from '../domain/model';
import { moveOpening } from '../domain/openings';
import { analyze, clampItem, footprint } from '../domain/planner';
import { FurnitureShape } from './FurnitureShape';
import OpeningShapes from './OpeningShapes';
import { furnitureTransform, rotationOf } from '../domain/rotation';

interface Props {
  project: Project;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onRotate?: () => void;
  onDelete?: () => void;
  onRoomChange?: (room: Room) => void;
  showGrid?: boolean;
  showDimensions?: boolean;
  mini?: boolean;
  zoom?: number;
}

export default function PlanCanvas({
  project,
  selected,
  onSelect,
  onMove,
  onDragStart,
  onDragEnd,
  onRotate,
  onDelete,
  onRoomChange,
  showGrid = true,
  showDimensions = true,
  mini = false,
  zoom = 1,
}: Props) {
  const gridId = useId().replaceAll(':', '');
  const floorRef = useRef<SVGGElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(
    null,
  );
  const { room } = project;
  const pad = mini && !onRoomChange ? 18 : 65;
  const vbWidth = room.width + pad * 2,
    vbHeight = room.depth + pad * 2;
  const viewWidth = vbWidth / zoom,
    viewHeight = vbHeight / zoom;
  const viewBox = mini
    ? `0 0 ${vbWidth} ${vbHeight}`
    : `${(vbWidth - viewWidth) / 2} ${(vbHeight - viewHeight) / 2} ${viewWidth} ${viewHeight}`;
  const issues = analyze(project).issues;
  const badIds = new Set(issues.flatMap((i) => i.ids));
  const coordinate = (event: PointerEvent) => {
    const matrix = floorRef.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : { x: 0, y: 0 };
  };
  const pointerDown = (event: PointerEvent<SVGGElement>, item: Furniture) => {
    if (mini || !onMove || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = coordinate(event);
    drag.current = { id: item.id, startX: point.x, startY: point.y, x: item.x, y: item.y };
    onDragStart?.();
    onSelect?.(item.id);
  };
  const pointerMove = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || !onMove) return;
    const point = coordinate(event);
    const item = project.furniture.find((f) => f.id === d.id)!;
    const moved = clampItem(
      {
        ...item,
        x: Math.round((d.x + point.x - d.startX) / 5) * 5,
        y: Math.round((d.y + point.y - d.startY) / 5) * 5,
      },
      room,
    );
    onMove(d.id, moved.x, moved.y);
  };
  const pointerEnd = () => {
    if (drag.current) {
      drag.current = null;
      onDragEnd?.();
    }
  };
  const keyDown = (event: KeyboardEvent<SVGGElement>, item: Furniture) => {
    if (!onMove) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (steps[event.key]) {
      event.preventDefault();
      onDragStart?.();
      const [dx, dy] = steps[event.key],
        step = event.shiftKey ? 10 : 5;
      const f = clampItem({ ...item, x: item.x + dx * step, y: item.y + dy * step }, room);
      onMove(item.id, f.x, f.y);
      onDragEnd?.();
    }
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      onRotate?.();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete?.();
    }
  };
  return (
    <svg
      id={mini ? undefined : 'room-plan'}
      className={`${mini ? 'mini-plan-svg' : 'plan-svg'}${onRoomChange ? ' openings-interactive' : ''}`}
      viewBox={viewBox}
      data-base-view-box={`0 0 ${vbWidth} ${vbHeight}`}
      role="img"
      aria-label={
        t(mini
          ? 'Room layout preview'
          : 'Interactive room layout. Select furniture and use arrow keys to move it or R to rotate.')
      }
    >
      <defs>
        <pattern id={`grid-${gridId}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#c9c1b4" strokeWidth=".45" opacity=".45" />
        </pattern>
        <filter id={`shadow-${gridId}`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#6a5b44" floodOpacity=".12" />
        </filter>
      </defs>
      <g ref={floorRef} transform={`translate(${pad} ${pad})`}>
        <rect
          x="-5"
          y="-5"
          width={room.width + 10}
          height={room.depth + 10}
          rx="2"
          fill="var(--plan-wall, #d7d1c6)"
        />
        <rect
          width={room.width}
          height={room.depth}
          fill="var(--plan-floor, #f6f1e7)"
          onPointerDown={() => onSelect?.(null)}
        />
        {showGrid && (
          <rect
            width={room.width}
            height={room.depth}
            fill={`url(#grid-${gridId})`}
            pointerEvents="none"
          />
        )}
        {[...project.furniture]
          .sort((a, b) => Number(a.kind !== 'rug') - Number(b.kind !== 'rug'))
          .map((item) => {
            const f = footprint(item),
              isSelected = selected === item.id && !mini,
              bad = badIds.has(item.id);
            return (
              <g
                key={item.id}
                data-furniture={item.id}
                tabIndex={mini ? undefined : 0}
                role={mini ? undefined : 'button'}
                aria-label={
                  t(mini ? undefined : `${item.name}, ${item.width} × ${item.depth} centimetres`)
                }
                aria-pressed={mini ? undefined : isSelected}
                className={mini ? '' : `furniture-item ${isSelected ? 'is-selected' : ''}`}
                transform={`translate(${item.x} ${item.y})`}
                onPointerDown={(event) => pointerDown(event, item)}
                onPointerMove={pointerMove}
                onPointerUp={pointerEnd}
                onPointerCancel={pointerEnd}
                onLostPointerCapture={pointerEnd}
                onKeyDown={(event) => keyDown(event, item)}
                onFocus={() => !mini && onSelect?.(item.id)}
              >
                <title>
                  {t(item.name)} · {item.width} × {item.depth}{t(" cm")}</title>
                <g
                  transform={furnitureTransform(item)}
                  data-rotation={rotationOf(item)}
                  filter={mini ? undefined : `url(#shadow-${gridId})`}
                >
                  <FurnitureShape item={item} mini={mini} />
                </g>
                {(isSelected || (bad && !mini)) && (
                  <rect
                    x="-3"
                    y="-3"
                    width={f.width + 6}
                    height={f.depth + 6}
                    rx="5"
                    fill="none"
                    stroke={bad ? '#dd6c61' : '#5879e9'}
                    strokeWidth="1.7"
                    strokeDasharray={bad ? '4 3' : undefined}
                    pointerEvents="none"
                  />
                )}
                {isSelected &&
                  [
                    [-3, -3],
                    [f.width + 3, -3],
                    [-3, f.depth + 3],
                    [f.width + 3, f.depth + 3],
                  ].map(([x, y], i) => (
                    <rect
                      key={i}
                      x={x - 2.5}
                      y={y - 2.5}
                      width="5"
                      height="5"
                      rx="1"
                      fill="white"
                      stroke="#5879e9"
                      strokeWidth="1.2"
                    />
                  ))}
                {isSelected && (
                  <g pointerEvents="none">
                    <rect
                      x={f.width / 2 - 29}
                      y={f.depth + 10}
                      width="58"
                      height="17"
                      rx="5"
                      fill="#2e3644"
                    />
                    <text
                      x={f.width / 2}
                      y={f.depth + 21.5}
                      fill="white"
                      textAnchor="middle"
                      fontSize="8"
                    >
                      {f.width} × {f.depth}{t(" cm")}</text>
                  </g>
                )}
              </g>
            );
          })}
        <OpeningShapes room={room} mini={mini && !onRoomChange} coordinate={coordinate}
          onMove={onRoomChange ? (id, x, y) => onRoomChange(moveOpening(room, id, x, y)) : undefined}
          onDragStart={onDragStart} onDragEnd={onDragEnd} />
        {showDimensions && !mini && (
          <g stroke="#a3a7ad" strokeWidth=".75" fill="none" pointerEvents="none">
            <path
              d={`M0 -32H${room.width}M0 -37v10M${room.width} -37v10M-30 0V${room.depth}M-35 0h10M-35 ${room.depth}h10`}
            />
            <rect
              x={room.width / 2 - 25}
              y="-40"
              width="50"
              height="16"
              fill="#fcfbf8"
              stroke="none"
            />
            <text
              x={room.width / 2}
              y="-29"
              textAnchor="middle"
              fontSize="9"
              fill="#7d8591"
              stroke="none"
            >
              {room.width}{t(" cm")}</text>
            <g transform={`translate(-30 ${room.depth / 2}) rotate(-90)`}>
              <rect x="-25" y="-8" width="50" height="16" fill="#fcfbf8" stroke="none" />
              <text y="3" textAnchor="middle" fontSize="9" fill="#7d8591" stroke="none">
                {room.depth}{t(" cm")}</text>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
