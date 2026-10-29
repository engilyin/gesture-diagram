import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { panView, zoomByDelta } from '../editor/canvas';
import { makeSelection } from '../editor/selection';
import { clampScale, createViewState, type ViewState } from '../editor/viewport';
import type { DiagramElement } from '../editor/types';

const canvasWidth = 1600;
const canvasHeight = 1000;

const seedElements: DiagramElement[] = [
  { id: 'node-1', kind: 'rect', x: 120, y: 120, width: 220, height: 120 },
  { id: 'node-2', kind: 'rect', x: 460, y: 320, width: 260, height: 120 },
];

export function EditorSurface() {
  const [view, setView] = useState<ViewState>(createViewState());
  const [selection, setSelection] = useState(makeSelection());
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const summary = useMemo(
    () => ({ scale: view.scale, selected: selection.ids.length }),
    [selection.ids.length, view.scale],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (event.button === 1 || event.shiftKey) {
      setIsPanning(true);
      dragStartRef.current = local;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPanning || !dragStartRef.current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const deltaX = local.x - dragStartRef.current.x;
    const deltaY = local.y - dragStartRef.current.y;
    setView((current) => panView(current, deltaX, deltaY));
    dragStartRef.current = local;
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    dragStartRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setView((current) => zoomByDelta(current, event.deltaY));
  };

  const handleZoomButton = (delta: number) => {
    setView((current) => ({ ...current, scale: clampScale(current.scale + delta) }));
  };

  return (
    <div className="editor-shell">
      <div className="toolbar" aria-label="Editor controls">
        <button type="button" onClick={() => handleZoomButton(0.1)}>Zoom In</button>
        <button type="button" onClick={() => handleZoomButton(-0.1)}>Zoom Out</button>
        <span aria-live="polite">
          Zoom: {summary.scale.toFixed(2)} | Selected: {summary.selected}
        </span>
      </div>

      <div
        className="editor-surface"
        aria-label="Diagram canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="viewport"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <div className="grid" aria-hidden="true" />
          {seedElements.map((element) => {
            const isSelected = selection.ids.includes(element.id);
            const style: CSSProperties = {
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              border: isSelected ? '2px solid #f97316' : '1px solid #1f2937',
              background: 'rgba(79, 70, 229, 0.12)',
              borderRadius: 8,
              boxSizing: 'border-box',
            };
            return (
              <button
                key={element.id}
                type="button"
                style={style}
                onClick={() => setSelection(makeSelection([element.id]))}
                aria-label={`Select ${element.id}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
