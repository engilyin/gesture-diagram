import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GestureFallbackPanel } from "./GestureFallbackPanel";
import { evaluateAmbiguity, type AmbiguityDecision } from "../editor/ambiguity";
import { normalizeStroke } from "../editor/input";
import { recognizeStroke } from "../editor/recognition";
import { makeSelection } from "../editor/selection";
import { createInk } from "../editor/shapes";
import {
  clampScale,
  createViewState,
  type ViewState,
} from "../editor/viewport";
import type { DiagramElement, Point } from "../editor/types";

const canvasWidth = 1600;
const canvasHeight = 1000;

export function EditorSurface() {
  const [view, setView] = useState<ViewState>(createViewState());
  const [elements, setElements] = useState<DiagramElement[]>([]);
  const [selection, setSelection] = useState(makeSelection());
  const [stroke, setStroke] = useState<Point[]>([]);
  const [pendingDecision, setPendingDecision] =
    useState<AmbiguityDecision | null>(null);
  const [pendingStroke, setPendingStroke] = useState<Point[] | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const summary = useMemo(
    () => ({ scale: view.scale, selected: selection.ids.length }),
    [selection.ids.length, view.scale],
  );

  const screenToWorld = (point: { x: number; y: number }) => ({
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    if (event.button === 1 || event.shiftKey) {
      setIsPanning(true);
      dragStartRef.current = local;
      return;
    }

    if (pendingDecision) {
      setPendingDecision(null);
      setPendingStroke(null);
    }

    const nextStroke = [...stroke, screenToWorld(local)];
    setStroke(nextStroke);
    setSelection(makeSelection());
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    if (isPanning && dragStartRef.current) {
      const dx = local.x - dragStartRef.current.x;
      const dy = local.y - dragStartRef.current.y;
      setView((current) => ({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      }));
      dragStartRef.current = local;
      return;
    }

    if (stroke.length > 0) {
      const world = screenToWorld(local);
      setStroke((current) => [...current, world]);
    }
  };

  const handlePointerUp = () => {
    if (stroke.length > 0) {
      const normalized = normalizeStroke(stroke);
      const result = recognizeStroke(normalized);
      const decision = evaluateAmbiguity(normalized);
      const mismatchedIntent =
        decision.kind !== "ink" && decision.kind !== result.kind;

      const shouldConfirmFallback =
        result.confidence < 0.75 || decision.kind === "ink" || mismatchedIntent;

      if (shouldConfirmFallback) {
        setPendingDecision(decision);
        setPendingStroke(normalized);
        setStroke([]);
        setIsPanning(false);
        dragStartRef.current = null;
        return;
      }

      const recognizedElement = result.element;
      if (recognizedElement) {
        setElements((current) => [...current, recognizedElement]);
        setSelection(makeSelection([recognizedElement.id]));
      }
      setStroke([]);
    }

    setIsPanning(false);
    dragStartRef.current = null;
  };

  const handleKeepInk = () => {
    if (pendingStroke && pendingStroke.length > 1) {
      const inkElement = createInk(pendingStroke);
      setElements((current) => [...current, inkElement]);
      setSelection(makeSelection([inkElement.id]));
    }
    setPendingDecision(null);
    setPendingStroke(null);
  };

  const handleDismissFallback = () => {
    setPendingDecision(null);
    setPendingStroke(null);
    setSelection(makeSelection());
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.1 : 0.1;
    const nextScale = clampScale(view.scale * (1 + direction));
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldX = (mouseX - view.x) / view.scale;
    const worldY = (mouseY - view.y) / view.scale;
    const x = mouseX - worldX * nextScale;
    const y = mouseY - worldY * nextScale;

    setView({ x, y, scale: nextScale });
  };

  const handleZoomButton = (delta: number) => {
    setView((current) => ({
      ...current,
      scale: clampScale(current.scale + delta),
    }));
  };

  return (
    <div className="editor-shell">
      <div className="toolbar" aria-label="Editor controls">
        <button type="button" onClick={() => handleZoomButton(0.1)}>
          Zoom In
        </button>
        <button type="button" onClick={() => handleZoomButton(-0.1)}>
          Zoom Out
        </button>
        <span aria-live="polite">
          Zoom: {summary.scale.toFixed(2)} | Selected: {summary.selected}
        </span>
      </div>

      {pendingDecision && (
        <GestureFallbackPanel
          message={`Gesture confidence is low (${pendingDecision.confidence.toFixed(2)}). Keep as ink or dismiss.`}
          onKeepInk={handleKeepInk}
          onRetryRecognition={handleDismissFallback}
        />
      )}

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
            transformOrigin: "0 0",
          }}
        >
          <div className="grid" aria-hidden="true" />
          {elements.map((element) => {
            const isSelected = selection.ids.includes(element.id);
            const style: CSSProperties = {
              position: "absolute",
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              border: isSelected ? "2px solid #f97316" : "1px solid #1f2937",
              background:
                element.kind === "rect"
                  ? "rgba(79, 70, 229, 0.12)"
                  : "transparent",
              borderRadius: element.kind === "rect" ? 8 : 0,
              boxSizing: "border-box",
            };

            if (element.kind === "line") {
              const lineStyle: CSSProperties = {
                ...style,
                background: "transparent",
                border: "0",
                borderRadius: 0,
                boxShadow: "none",
                overflow: "visible",
              };

              return (
                <div key={element.id} style={lineStyle} aria-label="Connector">
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderTop: isSelected
                        ? "4px solid #f97316"
                        : "3px solid #111827",
                      borderLeft: "0",
                      borderRight: "0",
                      borderBottom: "0",
                      boxShadow: "inset 0 0 0 1px rgba(17, 24, 39, 0.15)",
                      borderRadius: 0,
                    }}
                  />
                </div>
              );
            }

            if (element.kind === "ink" && element.points) {
              return (
                <svg
                  key={element.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    overflow: "visible",
                  }}
                >
                  <polyline
                    points={element.points
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    fill="none"
                    stroke={isSelected ? "#f97316" : "#2563eb"}
                    strokeWidth={isSelected ? 4 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              );
            }

            return <div key={element.id} style={style} />;
          })}

          {stroke.length > 0 && (
            <svg
              className="stroke-layer"
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={stroke
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
