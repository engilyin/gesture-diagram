import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GestureFallbackPanel } from "./GestureFallbackPanel";
import { ContextPalette, type PaletteAction } from "./ContextPalette";
import { DocumentPersistenceControls } from "./DocumentPersistenceControls";
import { SelectionHandles } from "./SelectionHandles";
import { evaluateAmbiguity, type AmbiguityDecision } from "../editor/ambiguity";
import {
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from "../editor/document";
import { normalizeStroke } from "../editor/input";
import {
  loadFromBrowserStorage,
  saveToBrowserStorage,
} from "../editor/persistence/browserStorage";
import {
  createDownloadFilename,
  createYamlExportBlob,
  importDocumentFromFile,
} from "../editor/persistence/fileWorkflow";
import { recognizeStroke } from "../editor/recognition";
import {
  getPrimarySelection,
  hasSelection,
  makeSelection,
} from "../editor/selection";
import { createInk } from "../editor/shapes";
import {
  moveElement,
  resizeElement,
  type ResizeHandle,
} from "../editor/transform";
import {
  clampScale,
  createViewState,
  type ViewState,
} from "../editor/viewport";
import type { DiagramElement, Point } from "../editor/types";

const canvasWidth = 1600;
const canvasHeight = 1000;

type DragMode = "draw" | "move" | "resize" | null;

export function EditorSurface() {
  const [view, setView] = useState<ViewState>(createViewState());
  const [elements, setElements] = useState<DiagramElement[]>([]);
  const [selection, setSelection] = useState(makeSelection());
  const [stroke, setStroke] = useState<Point[]>([]);
  const [pendingDecision, setPendingDecision] =
    useState<AmbiguityDecision | null>(null);
  const [pendingStroke, setPendingStroke] = useState<Point[] | null>(null);
  const [selectedActions, setSelectedActions] = useState<PaletteAction[]>([]);
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(
    null,
  );
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerWorldRef = useRef<Point | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(
    () => ({ scale: view.scale, selected: selection.ids.length }),
    [selection.ids.length, view.scale],
  );

  const selectedId = useMemo(() => getPrimarySelection(selection), [selection]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedId) ?? null,
    [elements, selectedId],
  );

  useEffect(() => {
    if (!hasSelection(selection)) {
      setSelectedActions([]);
      return;
    }

    const nextActions: PaletteAction[] = [
      { id: "convert", label: "Convert", kind: "convert", rank: 1 },
      { id: "duplicate", label: "Duplicate", kind: "duplicate", rank: 2 },
      { id: "style", label: "Style", kind: "style", rank: 3 },
      { id: "delete", label: "Delete", kind: "delete", rank: 4 },
    ];

    setSelectedActions(nextActions);
  }, [selection]);

  const screenToWorld = (point: { x: number; y: number }) => ({
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  });

  const getLocalPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitTestElement = (point: Point): DiagramElement | null => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];
      const padding = element.kind === "line" ? 8 : 0;
      const withinX =
        point.x >= element.x - padding &&
        point.x <= element.x + element.width + padding;
      const withinY =
        point.y >= element.y - padding &&
        point.y <= element.y + element.height + padding;

      if (withinX && withinY) {
        return element;
      }
    }

    return null;
  };

  const updateSelectedElement = (
    updater: (element: DiagramElement) => DiagramElement,
  ) => {
    if (!selectedId) {
      return;
    }

    setElements((current) =>
      current.map((element) =>
        element.id === selectedId ? updater(element) : element,
      ),
    );
  };

  const handlePaletteAction = (action: PaletteAction) => {
    if (!selectedId) {
      return;
    }

    if (action.kind === "style") {
      const colors = ["#4f46e5", "#0f766e", "#2563eb", "#b91c1c"];
      updateSelectedElement((element) => {
        const currentColor = element.color ?? colors[0];
        const currentIndex = colors.indexOf(currentColor);
        const nextColor =
          colors[(currentIndex + 1 + colors.length) % colors.length];

        return {
          ...element,
          color: nextColor,
        };
      });
      return;
    }

    if (action.kind === "duplicate") {
      const element = elements.find((item) => item.id === selectedId);
      if (!element) {
        return;
      }

      const duplicate: DiagramElement = {
        ...element,
        id: crypto.randomUUID(),
        x: element.x + 24,
        y: element.y + 24,
      };
      setElements((current) => [...current, duplicate]);
      setSelection(makeSelection([duplicate.id]));
      return;
    }

    if (action.kind === "delete") {
      setElements((current) =>
        current.filter((element) => element.id !== selectedId),
      );
      setSelection(makeSelection());
    }
  };

  const buildDocument = () => createDocumentFromElements(elements);

  const applyDocument = (documentPayload: ReturnType<typeof loadDocument>) => {
    const loaded = loadDocument(documentPayload);
    setElements(getDocumentElements(loaded));
    setSelection(makeSelection());
  };

  const handleSave = () => {
    try {
      const documentPayload = saveDocument(buildDocument());
      saveToBrowserStorage(documentPayload);
      setPersistenceError(null);
      setPersistenceMessage("Saved document to browser storage.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `Save failed: ${
          error instanceof Error ? error.message : "Unknown persistence error."
        }`,
      );
    }
  };

  const handleLoad = () => {
    try {
      const documentPayload = loadFromBrowserStorage();
      if (!documentPayload) {
        setPersistenceError(
          "No saved document found in browser storage. Save first before loading.",
        );
        setPersistenceMessage(null);
        return;
      }

      applyDocument(documentPayload);
      setPersistenceError(null);
      setPersistenceMessage("Loaded document from browser storage.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `Load failed: ${
          error instanceof Error ? error.message : "Unknown persistence error."
        }`,
      );
    }
  };

  const handleExport = () => {
    try {
      const blob = createYamlExportBlob(buildDocument());
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = createDownloadFilename();
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPersistenceError(null);
      setPersistenceMessage("Exported YAML file.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `Export failed: ${
          error instanceof Error ? error.message : "Unknown export error."
        }`,
      );
    }
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importDocumentFromFile(file);
      applyDocument(imported);
      setPersistenceError(null);
      setPersistenceMessage("Imported YAML file.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `Import failed: ${
          error instanceof Error
            ? error.message
            : "Unsupported or malformed YAML file."
        }`,
      );
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const local = getLocalPoint(event);

    if (event.button === 1 || event.shiftKey) {
      setIsPanning(true);
      dragStartRef.current = local;
      return;
    }

    if (pendingDecision) {
      setPendingDecision(null);
      setPendingStroke(null);
    }

    const world = screenToWorld(local);
    const hitElement = hitTestElement(world);

    if (hitElement) {
      setSelection(makeSelection([hitElement.id]));
      setStroke([]);
      setDragMode("move");
      lastPointerWorldRef.current = world;
      return;
    }

    setSelection(makeSelection());
    setDragMode("draw");
    setStroke([world]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const local = getLocalPoint(event);
    const world = screenToWorld(local);

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

    if (dragMode === "move" && selectedId && lastPointerWorldRef.current) {
      const dx = world.x - lastPointerWorldRef.current.x;
      const dy = world.y - lastPointerWorldRef.current.y;
      updateSelectedElement((element) => ({
        ...element,
        ...moveElement(element, dx, dy),
      }));
      lastPointerWorldRef.current = world;
      return;
    }

    if (
      dragMode === "resize" &&
      selectedId &&
      resizeHandle &&
      lastPointerWorldRef.current
    ) {
      const dx = world.x - lastPointerWorldRef.current.x;
      const dy = world.y - lastPointerWorldRef.current.y;
      updateSelectedElement((element) => {
        if (element.kind === "ink") {
          return element;
        }

        return {
          ...element,
          ...resizeElement(element, dx, dy, resizeHandle),
        };
      });
      lastPointerWorldRef.current = world;
      return;
    }

    if (dragMode === "draw" && stroke.length > 0) {
      setStroke((current) => [...current, world]);
    }
  };

  const handlePointerUp = () => {
    if (dragMode === "move" || dragMode === "resize") {
      setDragMode(null);
      setResizeHandle(null);
      setIsPanning(false);
      dragStartRef.current = null;
      lastPointerWorldRef.current = null;
      return;
    }

    if (stroke.length > 0 && dragMode === "draw") {
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
        setDragMode(null);
        setIsPanning(false);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }

      const recognizedElement = result.element;
      if (recognizedElement) {
        setElements((current) => [...current, recognizedElement]);
        setSelection(makeSelection([recognizedElement.id]));
      }
      setStroke([]);
    }

    setDragMode(null);
    setResizeHandle(null);
    setIsPanning(false);
    dragStartRef.current = null;
    lastPointerWorldRef.current = null;
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

  const handleResizeStart = (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!surfaceRef.current) {
      return;
    }

    const rect = surfaceRef.current.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    lastPointerWorldRef.current = screenToWorld(local);
    setResizeHandle(handle);
    setDragMode("resize");
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

      <DocumentPersistenceControls
        onSave={handleSave}
        onLoad={handleLoad}
        onExport={handleExport}
        onImport={handleImport}
      />

      {persistenceMessage && (
        <div className="persistence-message" role="status" aria-live="polite">
          {persistenceMessage}
        </div>
      )}

      {persistenceError && (
        <div className="persistence-error" role="alert">
          {persistenceError}
        </div>
      )}

      {selectedActions.length > 0 && (
        <ContextPalette
          actions={selectedActions}
          onAction={handlePaletteAction}
        />
      )}

      {pendingDecision && (
        <GestureFallbackPanel
          message={`Gesture confidence is low (${pendingDecision.confidence.toFixed(2)}). Keep as ink or dismiss.`}
          onKeepInk={handleKeepInk}
          onRetryRecognition={handleDismissFallback}
        />
      )}

      <div
        ref={surfaceRef}
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
            const strokeWidth = element.strokeWidth ?? 2;
            const baseColor = element.color ?? "#1f2937";
            const selectedColor = "#f97316";
            const style: CSSProperties = {
              position: "absolute",
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              border: isSelected
                ? `${strokeWidth}px solid ${selectedColor}`
                : `${strokeWidth}px solid ${baseColor}`,
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
                      borderTop: `${strokeWidth}px solid ${
                        isSelected ? selectedColor : baseColor
                      }`,
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
                    stroke={isSelected ? selectedColor : baseColor}
                    strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              );
            }

            return <div key={element.id} style={style} />;
          })}

          {selectedElement && selectedElement.kind !== "ink" && (
            <SelectionHandles
              x={selectedElement.x}
              y={selectedElement.y}
              width={selectedElement.width}
              height={selectedElement.height}
              onResizeStart={handleResizeStart}
            />
          )}

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
