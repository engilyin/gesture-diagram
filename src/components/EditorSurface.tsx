import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GestureFallbackPanel } from "./GestureFallbackPanel";
import {
  ContextPalette,
  type PaletteAction,
  type PaletteStyleVariant,
} from "./ContextPalette";
import { DocumentPersistenceControls } from "./DocumentPersistenceControls";
import { SelectionHandles } from "./SelectionHandles";
import { ConnectionPorts } from "./ConnectionPorts";
import { evaluateAmbiguity, type AmbiguityDecision } from "../editor/ambiguity";
import { getVisibleElements } from "../editor/culling";
import {
  attachConnectorEndpoints,
  enforceConnectorInvariants,
} from "../editor/connectorGraph";
import {
  applyOps,
  createInverseOps,
  createOpsFromElementDiff,
  type DiagramOp,
} from "../editor/ops";
import {
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from "../editor/document";
import {
  autoSizeContainers,
  collectOwnedDescendantIds,
  getGroupedSelectionIds,
  groupElements,
  moveGroupedElements,
  releaseChildrenFromParents,
  reconcileContainerOwnership,
  ungroupElements,
} from "../editor/grouping";
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
import { exportSvg } from "../editor/export/svg";
import { exportPng } from "../editor/export/png";
import { exportPdf } from "../editor/export/pdf";
import { importDrawIo } from "../editor/import/drawio";
import { importMermaid } from "../editor/import/mermaid";
import {
  getCycledSelectionId,
  nudgeSelectedElements,
} from "../editor/keyboardNavigation";
import { resolveElementPorts } from "../editor/ports";
import { recognizeStroke } from "../editor/recognition";
import {
  getPrimarySelection,
  hasSelection,
  makeSelection,
} from "../editor/selection";
import {
  createDiamond,
  createEllipse,
  createInk,
  createLine,
  createContainer,
  createRectangle,
  createText,
  createTriangle,
} from "../editor/shapes";
import { resizeElement, type ResizeHandle } from "../editor/transform";
import {
  clampScale,
  createViewState,
  type ViewState,
} from "../editor/viewport";
import type { DiagramDocument, DiagramElement, Point } from "../editor/types";
import { findSnapGuide, snapToGrid, type SnapGuide } from "../editor/snapping";

const canvasWidth = 1600;
const canvasHeight = 1000;
const minimapWidth = 200;
const minimapHeight = 125;
const fitPadding = 48;
const defaultDocumentTitle = "Untitled diagram";
const defaultCanvasBackground = "#ffffff";
const paletteColorSwatches = [
  "#4f46e5",
  "#0f766e",
  "#2563eb",
  "#b91c1c",
  "#ca8a04",
  "#374151",
];
const defaultLayerColor = "#4f46e5";
const onboardingDismissedStorageKey = "gd-onboarding-overlay-dismissed";

type DragMode = "draw" | "move" | "resize" | "rotate" | "marquee" | null;
type HistoryEntry = {
  undo: DiagramOp[];
  redo: DiagramOp[];
};
type MarqueeSelection = { start: Point; end: Point };
type ConnectionDragState = {
  fromId: string;
  start: Point;
  current: Point;
  targetId: string | null;
};
type RotateDragState = {
  elementId: string;
  center: Point;
  startAngle: number;
  initialRotation: number;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type ShapeChoice =
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "text"
  | "container"
  | "line";

function getDefaultStyleVariant(kind: DiagramElement["kind"]): PaletteStyleVariant {
  if (kind === "container") {
    return "dashed";
  }
  if (kind === "ink" || kind === "line" || kind === "text") {
    return "outlined";
  }
  return "filled";
}

type EditorLayer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
};

function getStrokeBounds(points: Point[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function createShapeFromStroke(kind: ShapeChoice, strokePoints: Point[]): DiagramElement {
  const bounds = getStrokeBounds(strokePoints);
  const width = Math.max(32, bounds.maxX - bounds.minX);
  const height = Math.max(32, bounds.maxY - bounds.minY);

  if (kind === "ellipse") {
    return createEllipse(bounds.minX, bounds.minY, width, height);
  }
  if (kind === "diamond") {
    return createDiamond(bounds.minX, bounds.minY, width, height);
  }
  if (kind === "triangle") {
    return createTriangle(bounds.minX, bounds.minY, width, height);
  }
  if (kind === "line") {
    return createLine(bounds.minX, bounds.minY, width, height);
  }
  if (kind === "container") {
    return createContainer(bounds.minX, bounds.minY, width, height);
  }
  if (kind === "text") {
    return createText(bounds.minX, bounds.minY, width, height);
  }
  return createRectangle(bounds.minX, bounds.minY, width, height);
}

function isHorizontalScribbleStroke(points: Point[]): boolean {
  if (points.length < 3) {
    return false;
  }

  const bounds = getStrokeBounds(points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const pathLength = points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    const previous = points[index - 1];
    if (!previous) {
      return total;
    }
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return false;
  }
  const startEndDistance = Math.hypot(end.x - start.x, end.y - start.y);

  return (
    width >= 40 &&
    height >= 2 &&
    height <= 42 &&
    width > height * 1.8 &&
    pathLength >= width * 1.05 &&
    startEndDistance <= width * 0.72
  );
}

function looksLikeTextGesture(points: Point[]): boolean {
  if (points.length < 2) {
    return false;
  }
  const bounds = getStrokeBounds(points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return width >= 40 && height <= 52 && width > height * 2;
}

function isElementLocked(element: DiagramElement): boolean {
  return Boolean(element.locked);
}

function supportsInlineTextEditing(element: DiagramElement): boolean {
  return element.kind !== "line" && element.kind !== "ink";
}

function createDefaultLayer(): EditorLayer {
  return {
    id: crypto.randomUUID(),
    name: "Layer 1",
    color: defaultLayerColor,
    visible: true,
    locked: false,
  };
}

type EditorSurfaceProps = {
  document?: DiagramDocument;
  readOnly?: boolean;
  profileId?: string;
  onDocumentChange?: (document: DiagramDocument) => void;
};

export function EditorSurface({
  document,
  readOnly = false,
  profileId,
  onDocumentChange,
}: EditorSurfaceProps) {
  const initialSettings = useMemo(
    () => ({
      title: document?.settings?.title ?? defaultDocumentTitle,
      background: document?.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: document?.settings?.canvas?.width,
        height: document?.settings?.canvas?.height,
      },
      layers:
        document?.settings?.layers && document.settings.layers.length > 0
          ? document.settings.layers.map((layer) => ({ ...layer }))
          : [createDefaultLayer()],
    }),
    [
      document?.settings?.background,
      document?.settings?.canvas?.height,
      document?.settings?.canvas?.width,
      document?.settings?.layers,
      document?.settings?.title,
    ],
  );
  const [view, setView] = useState<ViewState>(createViewState());
  const [elements, setElements] = useState<DiagramElement[]>(
    document ? [...document.elements] : [],
  );
  const [selection, setSelection] = useState(makeSelection());
  const [stroke, setStroke] = useState<Point[]>([]);
  const [strokeGhost, setStrokeGhost] = useState<DiagramElement | null>(null);
  const [pendingDecision, setPendingDecision] =
    useState<AmbiguityDecision | null>(null);
  const [pendingStroke, setPendingStroke] = useState<Point[] | null>(null);
  const [pendingElementId, setPendingElementId] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<PaletteAction[]>([]);
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(
    null,
  );
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [documentSettings, setDocumentSettings] = useState(initialSettings);
  const [activeLayerId, setActiveLayerId] = useState(
    initialSettings.layers[0]?.id ?? "",
  );
  const [surfaceSize, setSurfaceSize] = useState({ width: 1024, height: 768 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelection | null>(null);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const [snapGuide, setSnapGuide] = useState<SnapGuide | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
    null,
  );
  const rotateDragRef = useRef<RotateDragState | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState("");
  const [, setHistoryVersion] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerWorldRef = useRef<Point | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const applyingHistoryRef = useRef(false);
  const clipboardRef = useRef<DiagramElement[] | null>(null);
  const pasteSequenceRef = useRef(0);
  const draggedLayerIdRef = useRef<string | null>(null);
  const resizeTargetIdRef = useRef<string | null>(null);

  const cloneElements = useCallback((value: DiagramElement[]): DiagramElement[] => {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as DiagramElement[];
  }, []);

  const resetHistory = useCallback((snapshot: DiagramElement[]) => {
    if (snapshot.length < 0) {
      return;
    }
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion((current) => current + 1);
  }, []);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const summary = useMemo(
    () => ({ scale: view.scale, selected: selection.ids.length }),
    [selection.ids.length, view.scale],
  );

  const selectedId = useMemo(() => getPrimarySelection(selection), [selection]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const hoveredElement = useMemo(
    () =>
      elements.find(
        (element) =>
          element.id === hoveredElementId &&
          element.kind !== "line" &&
          element.kind !== "ink",
      ) ?? null,
    [elements, hoveredElementId],
  );

  const portSourceElement = useMemo(() => {
    if (hoveredElement) {
      return hoveredElement;
    }
    if (
      selectedElement &&
      selectedElement.kind !== "line" &&
      selectedElement.kind !== "ink"
    ) {
      return selectedElement;
    }
    return null;
  }, [hoveredElement, selectedElement]);

  const hoveredPorts = useMemo(
    () => (portSourceElement ? resolveElementPorts(portSourceElement) : []),
    [portSourceElement],
  );

  const layers = useMemo(() => {
    if (documentSettings.layers && documentSettings.layers.length > 0) {
      return documentSettings.layers;
    }
    return [createDefaultLayer()];
  }, [documentSettings.layers]);

  const layerIndexById = useMemo(
    () => new Map(layers.map((layer, index) => [layer.id, index])),
    [layers],
  );

  const layerByIndex = useMemo(
    () => new Map(layers.map((layer, index) => [index, layer])),
    [layers],
  );

  const activeLayerIndex = useMemo(() => {
    const mapped = layerIndexById.get(activeLayerId);
    if (mapped !== undefined) {
      return mapped;
    }
    return 0;
  }, [activeLayerId, layerIndexById]);

  const assignLayerToElement = useCallback(
    (element: DiagramElement): DiagramElement => ({
      ...element,
      layer: activeLayerIndex,
    }),
    [activeLayerIndex],
  );

  const isElementInteractionLocked = useCallback(
    (element: DiagramElement): boolean => {
      if (isElementLocked(element)) {
        return true;
      }
      const layerIndex = element.layer ?? 0;
      return Boolean(layerByIndex.get(layerIndex)?.locked);
    },
    [layerByIndex],
  );

  const gizmoElement = useMemo(() => {
    if (
      selectedElement &&
      selectedElement.kind !== "line" &&
      selectedElement.kind !== "ink" &&
      !isElementInteractionLocked(selectedElement)
    ) {
      return selectedElement;
    }
    if (
      hoveredElement &&
      hoveredElement.kind !== "line" &&
      hoveredElement.kind !== "ink" &&
      !isElementInteractionLocked(hoveredElement)
    ) {
      return hoveredElement;
    }
    return null;
  }, [hoveredElement, isElementInteractionLocked, selectedElement]);

  const visibleElements = useMemo(
    () =>
      getVisibleElements(
        elements.filter((element) => {
          const layerIndex = element.layer ?? 0;
          return layerByIndex.get(layerIndex)?.visible ?? true;
        }),
        view,
        surfaceSize,
      ),
    [elements, layerByIndex, surfaceSize, view],
  );

  const contentBounds = useMemo<Bounds | null>(() => {
    if (elements.length === 0) {
      return null;
    }

    return elements.reduce<Bounds>(
      (bounds, element) => ({
        minX: Math.min(bounds.minX, element.x),
        minY: Math.min(bounds.minY, element.y),
        maxX: Math.max(bounds.maxX, element.x + element.width),
        maxY: Math.max(bounds.maxY, element.y + element.height),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );
  }, [elements]);

  const viewportBounds = useMemo(
    () => ({
      minX: -view.x / view.scale,
      minY: -view.y / view.scale,
      width: surfaceSize.width / view.scale,
      height: surfaceSize.height / view.scale,
    }),
    [surfaceSize.height, surfaceSize.width, view.scale, view.x, view.y],
  );

  useEffect(() => {
    if (!surfaceRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextWidth = Math.max(1, Math.round(entry.contentRect.width));
      const nextHeight = Math.max(1, Math.round(entry.contentRect.height));
      setSurfaceSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    });

    observer.observe(surfaceRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (readOnly) {
      setIsOnboardingOpen(false);
      return;
    }
    const dismissed =
      typeof window !== "undefined" &&
      window.localStorage.getItem(onboardingDismissedStorageKey) === "1";
    setIsOnboardingOpen(!dismissed);
  }, [readOnly]);

  useEffect(() => {
    if (!hasSelection(selection)) {
      setSelectedActions([]);
      return;
    }

    const selectedElements = elements.filter((element) =>
      selection.ids.includes(element.id),
    );
    const hasLockedSelection = selectedElements.some((element) =>
      isElementInteractionLocked(element),
    );
    const hasUnlockedSelection = selectedElements.some(
      (element) => !isElementInteractionLocked(element),
    );
    const canGroup = selection.ids.length > 1;
    const canUngroup = selectedElements.some((element) =>
      Boolean(element.groupId),
    );

    const nextActions: PaletteAction[] = [
      { id: "duplicate", label: "Duplicate", kind: "duplicate", rank: 1 },
      ...(canGroup
        ? [{ id: "group", label: "Group", kind: "group" as const, rank: 2 }]
        : []),
      ...(canUngroup
        ? [
            {
              id: "ungroup",
              label: "Ungroup",
              kind: "ungroup" as const,
              rank: 3,
            },
          ]
        : []),
      ...(hasUnlockedSelection
        ? [{ id: "lock", label: "Lock", kind: "lock" as const, rank: 4 }]
        : []),
      ...(hasLockedSelection
        ? [{ id: "unlock", label: "Unlock", kind: "unlock" as const, rank: 5 }]
        : []),
      { id: "delete", label: "Delete", kind: "delete", rank: 6 },
    ];

    setSelectedActions(nextActions);
  }, [elements, isElementInteractionLocked, selection]);

  const applyElementsWithInvariants = useCallback(
    (updater: (current: DiagramElement[]) => DiagramElement[]) => {
    setElements((current) => {
      const updated = updater(current);
      const ops = createOpsFromElementDiff(current, updated);
      const opApplied = applyOps(current, ops);
      const reconciled = reconcileContainerOwnership(opApplied);
      const resized = autoSizeContainers(reconciled);
      const repaired = enforceConnectorInvariants(resized);
      const nextElements = repaired.repairedElements;

      if (!applyingHistoryRef.current) {
        const currentJson = JSON.stringify(current);
        const nextJson = JSON.stringify(nextElements);
        if (currentJson !== nextJson) {
          const undoOps = createInverseOps(current, ops);
          if (undoOps.length > 0 && ops.length > 0) {
            undoStackRef.current.push({
              undo: undoOps,
              redo: ops,
            });
          }
          if (undoStackRef.current.length > 200) {
            undoStackRef.current.shift();
          }
          redoStackRef.current = [];
          setHistoryVersion((value) => value + 1);
        }
      }

      return nextElements;
    });
  }, []);

  const screenToWorld = (point: { x: number; y: number }) => ({
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  });

  const getLocalPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const clientX = Number.isFinite(event.clientX) ? event.clientX : left;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : top;
    return { x: clientX - left, y: clientY - top };
  };

  const getLocalPointFromMouse = (event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const clientX = Number.isFinite(event.clientX) ? event.clientX : left;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : top;
    return { x: clientX - left, y: clientY - top };
  };

  const hitTestElement = (point: Point): DiagramElement | null => {
    for (let index = visibleElements.length - 1; index >= 0; index -= 1) {
      const element = visibleElements[index];
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

  const hitTestConnectableElement = (
    point: Point,
    sourceId: string,
  ): DiagramElement | null => {
    const hit = hitTestElement(point);
    if (!hit || hit.id === sourceId) {
      return null;
    }
    if (hit.kind === "line" || hit.kind === "ink") {
      return null;
    }
    return hit;
  };

  const getElementCenter = (element: DiagramElement): Point => ({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  });

  const updateSelectedElement = useCallback(
    (updater: (element: DiagramElement) => DiagramElement) => {
      if (!selectedId) {
        return;
      }

      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === selectedId ? updater(element) : element,
        ),
      );
    },
    [applyElementsWithInvariants, selectedId],
  );

  const startInlineTextEdit = useCallback(
    (element: DiagramElement) => {
      if (!supportsInlineTextEditing(element) || isElementInteractionLocked(element)) {
        return;
      }
      setEditingTextElementId(element.id);
      setTextDraft(element.text ?? "");
    },
    [isElementInteractionLocked],
  );

  const instantiateClipboardElements = useCallback(
    (source: DiagramElement[], offsetStep: number) => {
      const idMap = new Map<string, string>();
      source.forEach((element) => {
        idMap.set(element.id, crypto.randomUUID());
      });

      const nextElements = source.map((element) => {
        const nextId = idMap.get(element.id) ?? element.id;
        const connector =
          element.connector &&
          idMap.has(element.connector.fromId) &&
          idMap.has(element.connector.toId)
            ? {
                fromId: idMap.get(element.connector.fromId) ?? element.connector.fromId,
                toId: idMap.get(element.connector.toId) ?? element.connector.toId,
              }
            : undefined;

        return {
          ...element,
          id: nextId,
          x: element.x + offsetStep,
          y: element.y + offsetStep,
          points: element.points?.map((point) => ({
            x: point.x + offsetStep,
            y: point.y + offsetStep,
          })),
          connector,
        };
      });

      return {
        elements: nextElements,
        ids: nextElements.map((element) => element.id),
      };
    },
    [],
  );

  const getSelectionForClipboard = useCallback(() => {
    if (selection.ids.length === 0) {
      return [];
    }

    const ids = new Set(getGroupedSelectionIds(elements, selection.ids));
    const picked = elements.filter((element) => ids.has(element.id));
    return cloneElements(picked);
  }, [cloneElements, elements, selection.ids]);

  const copySelection = useCallback(() => {
    const payload = getSelectionForClipboard();
    if (payload.length === 0) {
      return;
    }
    clipboardRef.current = payload;
    pasteSequenceRef.current = 0;
  }, [getSelectionForClipboard]);

  const cutSelection = useCallback(() => {
    const payload = getSelectionForClipboard();
    if (payload.length === 0) {
      return;
    }
    clipboardRef.current = payload;
    pasteSequenceRef.current = 0;
    const idsToDelete = new Set(payload.map((element) => element.id));
    applyElementsWithInvariants((current) =>
      current.filter((element) => !idsToDelete.has(element.id)),
    );
    setSelection(makeSelection());
  }, [applyElementsWithInvariants, getSelectionForClipboard]);

  const pasteClipboard = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload || payload.length === 0) {
      return;
    }

    const offsetStep = 24 * (pasteSequenceRef.current + 1);
    const next = instantiateClipboardElements(payload, offsetStep);
    applyElementsWithInvariants((current) => [...current, ...next.elements]);
    setSelection(makeSelection(next.ids));
    pasteSequenceRef.current += 1;
  }, [applyElementsWithInvariants, instantiateClipboardElements]);

  const duplicateSelection = useCallback(() => {
    const payload = getSelectionForClipboard();
    if (payload.length === 0) {
      return;
    }
    const next = instantiateClipboardElements(payload, 24);
    applyElementsWithInvariants((current) => [...current, ...next.elements]);
    setSelection(makeSelection(next.ids));
  }, [applyElementsWithInvariants, getSelectionForClipboard, instantiateClipboardElements]);

  const performUndo = useCallback(() => {
    if (!canUndo) {
      return;
    }

    const entry = undoStackRef.current.pop();
    if (!entry) {
      return;
    }

    applyingHistoryRef.current = true;
    setElements((current) => {
      const updated = applyOps(current, entry.undo);
      const reconciled = reconcileContainerOwnership(updated);
      const resized = autoSizeContainers(reconciled);
      const repaired = enforceConnectorInvariants(resized);
      return repaired.repairedElements;
    });
    redoStackRef.current.push(entry);
    setSelection(makeSelection());
    applyingHistoryRef.current = false;
    setHistoryVersion((value) => value + 1);
  }, [canUndo]);

  const performRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    const entry = redoStackRef.current.pop();
    if (!entry) {
      return;
    }

    applyingHistoryRef.current = true;
    setElements((current) => {
      const updated = applyOps(current, entry.redo);
      const reconciled = reconcileContainerOwnership(updated);
      const resized = autoSizeContainers(reconciled);
      const repaired = enforceConnectorInvariants(resized);
      return repaired.repairedElements;
    });
    undoStackRef.current.push(entry);
    setSelection(makeSelection());
    applyingHistoryRef.current = false;
    setHistoryVersion((value) => value + 1);
  }, [canRedo]);

  const handlePaletteAction = (action: PaletteAction) => {
    if (readOnly) {
      return;
    }

    if (!selectedId) {
      return;
    }

    if (action.kind === "duplicate") {
      duplicateSelection();
      return;
    }

    if (action.kind === "lock" || action.kind === "unlock") {
      const targetIds = new Set(getGroupedSelectionIds(elements, selection.ids));
      const lockedState = action.kind === "lock";
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          targetIds.has(element.id)
            ? {
                ...element,
                locked: lockedState,
              }
            : element,
        ),
      );
      return;
    }

    if (action.kind === "group" && selection.ids.length > 1) {
      const groupId = crypto.randomUUID();
      applyElementsWithInvariants((current) =>
        groupElements(current, selection.ids, groupId),
      );
      return;
    }

    if (action.kind === "ungroup") {
      const selectedElements = elements.filter((element) =>
        selection.ids.includes(element.id),
      );
      const groupId = selectedElements.find(
        (element) => element.groupId,
      )?.groupId;
      if (!groupId) {
        return;
      }

      applyElementsWithInvariants((current) =>
        ungroupElements(current, groupId),
      );
      return;
    }

    if (action.kind === "delete") {
      const idsToDelete = new Set(
        getGroupedSelectionIds(elements, [selectedId]),
      );
      const ownedDescendants = collectOwnedDescendantIds(
        elements,
        [...idsToDelete],
      );
      const hasOwnedDescendants = ownedDescendants.length > 0;

      if (hasOwnedDescendants) {
        const shouldDeleteChildren = window.confirm(
          "Delete this container and all children? Click Cancel to release children.",
        );

        if (!shouldDeleteChildren) {
          applyElementsWithInvariants((current) => {
            const deleted = current.filter((element) => !idsToDelete.has(element.id));
            return releaseChildrenFromParents(deleted, idsToDelete);
          });
          setSelection(makeSelection());
          return;
        }
      }

      const idsWithDescendants = new Set([...idsToDelete, ...ownedDescendants]);
      applyElementsWithInvariants((current) =>
        current.filter(
          (element) =>
            !idsWithDescendants.has(element.id) || isElementInteractionLocked(element),
        ),
      );
      setSelection(makeSelection());
    }
  };

  const handleConvertKind = useCallback(
    (nextKind: DiagramElement["kind"]) => {
      if (readOnly || !selectedElement || selectedElement.kind === "ink") {
        return;
      }

      updateSelectedElement((element) => ({
        ...element,
        kind: nextKind,
        text: nextKind === "text" ? element.text ?? "" : element.text,
      }));

      if (nextKind === "text") {
        startInlineTextEdit({
          ...selectedElement,
          kind: nextKind,
        });
      }
    },
    [readOnly, selectedElement, startInlineTextEdit, updateSelectedElement],
  );

  const handleSelectColor = useCallback(
    (color: string) => {
      if (readOnly || !selectedElement || selectedElement.kind === "ink") {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        color,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const handleSelectStyleVariant = useCallback(
    (styleVariant: PaletteStyleVariant) => {
      if (readOnly || !selectedElement || selectedElement.kind === "ink") {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        styleVariant,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const selectedStyleVariant: PaletteStyleVariant | null = selectedElement
    ? selectedElement.styleVariant ?? getDefaultStyleVariant(selectedElement.kind)
    : null;

  const shouldShowShapeCustomizer =
    !readOnly &&
    selection.ids.length === 1 &&
    selectedElement != null &&
    selectedElement.kind !== "ink";

  const palettePosition = useMemo(() => {
    if (!shouldShowShapeCustomizer || !selectedElement) {
      return null;
    }
    const estimatedWidth = 420;
    const estimatedHeight = 150;
    const desiredX = view.x + (selectedElement.x + selectedElement.width) * view.scale + 12;
    const desiredY = view.y + selectedElement.y * view.scale - 8;
    const maxX = Math.max(12, surfaceSize.width - estimatedWidth - 12);
    const maxY = Math.max(12, surfaceSize.height - estimatedHeight - 12);
    return {
      x: Math.min(Math.max(12, desiredX), maxX),
      y: Math.min(Math.max(12, desiredY), maxY),
    };
  }, [selectedElement, shouldShowShapeCustomizer, surfaceSize.height, surfaceSize.width, view.scale, view.x, view.y]);

  const buildDocument = useCallback(() => {
    const nextDocument = createDocumentFromElements(
      elements,
      document?.version ?? "0.1.0",
      documentSettings,
    );

    if (document?.metadata || profileId) {
      nextDocument.metadata = {
        ...(document?.metadata ?? {
          schemaVersion: "v1",
          updatedAt: new Date().toISOString(),
        }),
        profileId: profileId ?? document?.metadata?.profileId,
      };
    }

    return nextDocument;
  }, [document?.metadata, document?.version, documentSettings, elements, profileId]);

  useEffect(() => {
    if (!document) {
      return;
    }

    const incomingLayers =
      document.settings?.layers && document.settings.layers.length > 0
        ? document.settings.layers.map((layer) => ({ ...layer }))
        : [createDefaultLayer()];
    setElements([...document.elements]);
    setDocumentSettings({
      title: document.settings?.title ?? defaultDocumentTitle,
      background: document.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: document.settings?.canvas?.width,
        height: document.settings?.canvas?.height,
      },
      layers: incomingLayers,
    });
    setActiveLayerId(incomingLayers[0]?.id ?? "");
    setSelection(makeSelection());
    resetHistory(document.elements);
  }, [document, resetHistory]);

  useEffect(() => {
    onDocumentChange?.(buildDocument());
  }, [buildDocument, onDocumentChange]);

  useEffect(() => {
    if (undoStackRef.current.length > 0) {
      return;
    }

    resetHistory(elements);
  }, [elements, resetHistory]);

  const applyDocument = (documentPayload: ReturnType<typeof loadDocument>) => {
    const loaded = loadDocument(documentPayload);
    const repaired = enforceConnectorInvariants(getDocumentElements(loaded));
    const loadedLayers =
      loaded.settings?.layers && loaded.settings.layers.length > 0
        ? loaded.settings.layers.map((layer) => ({ ...layer }))
        : [createDefaultLayer()];
    setElements(repaired.repairedElements);
    setDocumentSettings({
      title: loaded.settings?.title ?? defaultDocumentTitle,
      background: loaded.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: loaded.settings?.canvas?.width,
        height: loaded.settings?.canvas?.height,
      },
      layers: loadedLayers,
    });
    setActiveLayerId(loadedLayers[0]?.id ?? "");
    setSelection(makeSelection());
    resetHistory(repaired.repairedElements);
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

  const handleExportSvg = () => {
    try {
      const { content, warnings } = exportSvg(buildDocument());
      const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = createDownloadFilename().replace(/\.yaml$/, ".svg");
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPersistenceError(null);
      setPersistenceMessage(
        warnings.length > 0
          ? `Exported SVG with ${warnings.length} fidelity warnings.`
          : "Exported SVG file.",
      );
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `SVG export failed: ${
          error instanceof Error ? error.message : "Unknown export error."
        }`,
      );
    }
  };

  const handleExportPng = async () => {
    try {
      const blob = await exportPng(buildDocument());
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = createDownloadFilename().replace(/\.yaml$/, ".png");
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPersistenceError(null);
      setPersistenceMessage("Exported PNG file.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `PNG export failed: ${
          error instanceof Error ? error.message : "Unknown export error."
        }`,
      );
    }
  };

  const handleExportPdf = async () => {
    try {
      const blob = await exportPdf(buildDocument());
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = createDownloadFilename().replace(/\.yaml$/, ".pdf");
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPersistenceError(null);
      setPersistenceMessage("Exported PDF file.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `PDF export failed: ${
          error instanceof Error ? error.message : "Unknown export error."
        }`,
      );
    }
  };

  const handleImport = async (file: File) => {
    try {
      const lowerName = file.name.toLowerCase();
      const source = await file.text();

      if (lowerName.endsWith(".drawio") || lowerName.endsWith(".xml")) {
        const imported = importDrawIo(source);
        applyDocument(imported.document);
        setPersistenceError(null);
        setPersistenceMessage(
          imported.fidelity.warnings.length > 0
            ? `Imported draw.io file with ${imported.fidelity.warnings.length} fidelity warnings.`
            : "Imported draw.io file.",
        );
        return;
      }

      if (lowerName.endsWith(".mmd") || lowerName.endsWith(".mermaid")) {
        const imported = importMermaid(source);
        applyDocument(imported.document);
        setPersistenceError(null);
        setPersistenceMessage("Imported Mermaid file.");
        return;
      }

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

  const buildStrokeGhost = useCallback((points: Point[]): DiagramElement | null => {
    if (points.length < 2) {
      return null;
    }

    const normalized = normalizeStroke(points);
    if (normalized.length < 2) {
      return null;
    }

    if (looksLikeTextGesture(normalized) || isHorizontalScribbleStroke(normalized)) {
      const textGhost = createShapeFromStroke("text", normalized);
      return {
        ...textGhost,
        x: snapToGrid(textGhost.x),
        y: snapToGrid(textGhost.y),
      };
    }

    const recognition = recognizeStroke(normalized);
    const decision = evaluateAmbiguity(normalized);
    const fallbackKind: ShapeChoice = decision.kind === "line" ? "line" : "rect";
    const threshold = 0.4;
    const baseGhost =
      recognition.kind !== "ink" && recognition.element && recognition.confidence >= threshold
        ? recognition.element
        : createShapeFromStroke(fallbackKind, normalized);

    return {
      ...baseGhost,
      x: snapToGrid(baseGhost.x),
      y: snapToGrid(baseGhost.y),
    };
  }, []);

  const handlePortPointerDown = (
    port: { absoluteX: number; absoluteY: number },
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (readOnly || !portSourceElement || isElementInteractionLocked(portSourceElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelection(makeSelection([portSourceElement.id]));
    setConnectionDrag({
      fromId: portSourceElement.id,
      start: { x: port.absoluteX, y: port.absoluteY },
      current: { x: port.absoluteX, y: port.absoluteY },
      targetId: null,
    });
    setDragMode(null);
    setStroke([]);
    setSnapGuide(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }

    const local = getLocalPoint(event);

    if (event.button === 1 || event.shiftKey) {
      setIsPanning(true);
      dragStartRef.current = local;
      setStrokeGhost(null);
      return;
    }

    if (pendingDecision) {
      setPendingDecision(null);
      setPendingStroke(null);
      setPendingElementId(null);
    }

    const world = screenToWorld(local);
    const hitElement = hitTestElement(world);

    if (hitElement) {
      if (isElementInteractionLocked(hitElement)) {
        const nextSelection = hitElement.groupId
          ? getGroupedSelectionIds(elements, [hitElement.id])
          : [hitElement.id];
        setSelection(makeSelection(nextSelection));
        setStroke([]);
        setStrokeGhost(null);
        setDragMode(null);
        setSnapGuide(null);
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        const nextIds = selection.ids.includes(hitElement.id)
          ? selection.ids.filter((id) => id !== hitElement.id)
          : [...selection.ids, hitElement.id];
        setSelection(makeSelection(nextIds));
        setDragMode(null);
        setSnapGuide(null);
        setStrokeGhost(null);
        return;
      }

      const nextSelection = hitElement.groupId
        ? getGroupedSelectionIds(elements, [hitElement.id])
        : [hitElement.id];
      setSelection(makeSelection(nextSelection));
      setStroke([]);
      setStrokeGhost(null);
      setDragMode("move");
      lastPointerWorldRef.current = world;
      setSnapGuide(null);
      return;
    }

    setSelection(makeSelection());
    setDragMode("draw");
    setMarqueeSelection(null);
    setSnapGuide(null);
    setStroke([world]);
    setStrokeGhost(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }

    const local = getLocalPoint(event);
    const world = screenToWorld(local);
    const hovered = hitTestElement(world);
    setHoveredElementId(
      hovered && hovered.kind !== "line" && hovered.kind !== "ink"
        ? hovered.id
        : null,
    );

    if (connectionDrag) {
      const target = hitTestConnectableElement(world, connectionDrag.fromId);
      setConnectionDrag((current) =>
        current
          ? {
              ...current,
              current: world,
              targetId: target?.id ?? null,
            }
          : current,
      );
      return;
    }

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
      const movableIds = selection.ids.filter((id) => {
        const target = elements.find((element) => element.id === id);
        if (!target) {
          return false;
        }
        return !isElementInteractionLocked(target);
      });
      if (movableIds.length === 0) {
        setDragMode(null);
        lastPointerWorldRef.current = null;
        return;
      }
      const dx = world.x - lastPointerWorldRef.current.x;
      const dy = world.y - lastPointerWorldRef.current.y;
      const snapDisabled = event.altKey;
      let snappedPosition: { x: number; y: number } | null = null;
      let guide: SnapGuide | null = null;

      if (!snapDisabled && selection.ids.length === 1) {
        const primary = elements.find((element) => element.id === selectedId);
        if (
          primary &&
          primary.kind !== "line" &&
          !isElementInteractionLocked(primary)
        ) {
          const preview = { ...primary, x: primary.x + dx, y: primary.y + dy };
          const others = elements.filter((element) => element.id !== selectedId);
          const shapeSnap = findSnapGuide(preview, others);
          const useShapeSnap = Boolean(shapeSnap.guide);
          snappedPosition = {
            x: useShapeSnap ? shapeSnap.x : snapToGrid(preview.x),
            y: useShapeSnap ? shapeSnap.y : snapToGrid(preview.y),
          };
          guide = shapeSnap.guide;
        }
      }

      applyElementsWithInvariants((current) =>
        {
          const moved = moveGroupedElements(current, movableIds, dx, dy);
          if (snapDisabled || selection.ids.length !== 1 || !snappedPosition) {
            return moved;
          }

          return moved.map((element) =>
            element.id === selectedId
              ? { ...element, x: snappedPosition.x, y: snappedPosition.y }
              : element,
          );
        },
      );
      if (snapDisabled) {
        setSnapGuide(null);
      } else {
        setSnapGuide(guide);
      }
      lastPointerWorldRef.current = world;
      return;
    }

    if (dragMode === "resize" && resizeHandle && lastPointerWorldRef.current) {
      const resizeElementId = selectedId ?? resizeTargetIdRef.current;
      if (!resizeElementId) {
        return;
      }
      const selected = elements.find((element) => element.id === resizeElementId);
      if (!selected || isElementInteractionLocked(selected)) {
        setDragMode(null);
        setResizeHandle(null);
        resizeTargetIdRef.current = null;
        return;
      }

      const dx = world.x - lastPointerWorldRef.current.x;
      const dy = world.y - lastPointerWorldRef.current.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return;
      }
      applyElementsWithInvariants((current) =>
        current.map((element) => {
          if (element.id !== resizeElementId || element.kind === "ink") {
            return element;
          }

          return {
            ...element,
            ...resizeElement(element, dx, dy, resizeHandle),
          };
        }),
      );
      lastPointerWorldRef.current = world;
      return;
    }

    if (dragMode === "rotate" && rotateDragRef.current) {
      const { center, startAngle, initialRotation, elementId } = rotateDragRef.current;
      const currentAngle = Math.atan2(world.y - center.y, world.x - center.x);
      const delta = currentAngle - startAngle;
      const nextRotation = ((initialRotation + (delta * 180) / Math.PI) % 360 + 360) % 360;
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === elementId
            ? {
                ...element,
                rotation: Number.parseFloat(nextRotation.toFixed(2)),
              }
            : element,
        ),
      );
      return;
    }

    if (dragMode === "marquee" && marqueeSelection) {
      setMarqueeSelection((current) =>
        current
          ? {
              ...current,
              end: world,
            }
          : current,
      );
      return;
    }

    if (dragMode === "draw" && stroke.length > 0) {
      const start = stroke[0];
      const width = Math.abs(world.x - start.x);
      const height = Math.abs(world.y - start.y);
      const canUseMarquee = !event.altKey && event.pointerType !== "pen";
      if (canUseMarquee && stroke.length <= 2 && width >= 24 && height >= 24) {
        setDragMode("marquee");
        setStroke([]);
        setStrokeGhost(null);
        setMarqueeSelection({
          start,
          end: world,
        });
        return;
      }
      const nextStroke = [...stroke, world];
      setStroke(nextStroke);
      setStrokeGhost(buildStrokeGhost(nextStroke));
    }
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }
    const local = getLocalPointFromMouse(event);
    const world = screenToWorld(local);
    const hovered = hitTestElement(world);
    setHoveredElementId(
      hovered && hovered.kind !== "line" && hovered.kind !== "ink"
        ? hovered.id
        : null,
    );
  };

  const handlePointerUp = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }
    setStrokeGhost(null);

    if (connectionDrag) {
      const source = elements.find((element) => element.id === connectionDrag.fromId);
      const dropWorld = event ? screenToWorld(getLocalPoint(event)) : null;
      const fallbackTarget = dropWorld
        ? hitTestConnectableElement(dropWorld, connectionDrag.fromId)
        : null;
      const targetId = connectionDrag.targetId ?? fallbackTarget?.id ?? null;
      const draggedDistance = Math.hypot(
        connectionDrag.current.x - connectionDrag.start.x,
        connectionDrag.current.y - connectionDrag.start.y,
      );
      const connectableCandidates = elements.filter(
        (element) =>
          element.id !== connectionDrag.fromId &&
          element.kind !== "line" &&
          element.kind !== "ink",
      );
      const nearestCandidate =
        draggedDistance >= 8 && connectableCandidates.length > 0
          ? connectableCandidates.reduce<DiagramElement | null>((closest, candidate) => {
              const pointer = dropWorld ?? connectionDrag.current;
              const center = getElementCenter(candidate);
              const distance = Math.hypot(center.x - pointer.x, center.y - pointer.y);
              if (!closest) {
                return candidate;
              }
              const closestCenter = getElementCenter(closest);
              const closestDistance = Math.hypot(
                closestCenter.x - pointer.x,
                closestCenter.y - pointer.y,
              );
              return distance < closestDistance ? candidate : closest;
            }, null)
          : null;
      const target = targetId
        ? elements.find((element) => element.id === targetId)
        : nearestCandidate;

      if (
        source &&
        target &&
        source.id !== target.id &&
        source.kind !== "line" &&
        source.kind !== "ink" &&
        target.kind !== "line" &&
        target.kind !== "ink"
      ) {
        const fromCenter = getElementCenter(source);
        const toCenter = getElementCenter(target);
        const nextConnector = assignLayerToElement(
          createLine(
            Math.min(fromCenter.x, toCenter.x),
            Math.min(fromCenter.y, toCenter.y),
            Math.abs(toCenter.x - fromCenter.x),
            Math.abs(toCenter.y - fromCenter.y),
          ),
        );
        applyElementsWithInvariants((current) => [
          ...current,
          {
            ...nextConnector,
            connector: {
              fromId: source.id,
              toId: target.id,
            },
          },
        ]);
        setSelection(makeSelection([nextConnector.id]));
      }

      setConnectionDrag(null);
      setHoveredElementId(null);
      setDragMode(null);
      setSnapGuide(null);
      dragStartRef.current = null;
      lastPointerWorldRef.current = null;
      return;
    }

    if (dragMode === "rotate" && rotateDragRef.current && event) {
      const { center, startAngle, initialRotation, elementId } = rotateDragRef.current;
      const local = getLocalPoint(event);
      const world = screenToWorld(local);
      const currentAngle = Math.atan2(world.y - center.y, world.x - center.x);
      const delta = currentAngle - startAngle;
      const nextRotation = ((initialRotation + (delta * 180) / Math.PI) % 360 + 360) % 360;
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === elementId
            ? {
                ...element,
                rotation: Number.parseFloat(nextRotation.toFixed(2)),
              }
            : element,
        ),
      );
    }

    if (dragMode === "move" || dragMode === "resize" || dragMode === "rotate") {
      setDragMode(null);
      setResizeHandle(null);
      resizeTargetIdRef.current = null;
      rotateDragRef.current = null;
      setIsPanning(false);
      setSnapGuide(null);
      setHoveredElementId(null);
      dragStartRef.current = null;
      lastPointerWorldRef.current = null;
      return;
    }

    if (dragMode === "marquee" && marqueeSelection) {
      const minX = Math.min(marqueeSelection.start.x, marqueeSelection.end.x);
      const maxX = Math.max(marqueeSelection.start.x, marqueeSelection.end.x);
      const minY = Math.min(marqueeSelection.start.y, marqueeSelection.end.y);
      const maxY = Math.max(marqueeSelection.start.y, marqueeSelection.end.y);

      const selectedIds = elements
        .filter(
          (element) =>
            element.x >= minX &&
            element.y >= minY &&
            element.x + element.width <= maxX &&
            element.y + element.height <= maxY,
        )
        .map((element) => element.id);

      setSelection(makeSelection(selectedIds));
      setMarqueeSelection(null);
      setDragMode(null);
      setIsPanning(false);
      setSnapGuide(null);
      setHoveredElementId(null);
      dragStartRef.current = null;
      lastPointerWorldRef.current = null;
      return;
    }

    if (stroke.length === 1 && dragMode === "draw") {
      const tapPoint = stroke[0];
      if (tapPoint) {
        const textElement = assignLayerToElement(
          createText(tapPoint.x, tapPoint.y, 160, 56),
        );
        applyElementsWithInvariants((current) => [...current, textElement]);
        setSelection(makeSelection([textElement.id]));
        startInlineTextEdit(textElement);
      }
      setStroke([]);
    } else if (stroke.length > 0 && dragMode === "draw") {
      if (looksLikeTextGesture(stroke)) {
        const textElement = assignLayerToElement(
          createShapeFromStroke("text", stroke),
        );
        applyElementsWithInvariants((current) => [...current, textElement]);
        setSelection(makeSelection([textElement.id]));
        startInlineTextEdit(textElement);
        setStroke([]);
        setMarqueeSelection(null);
        setDragMode(null);
        setIsPanning(false);
        setHoveredElementId(null);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }
      const normalized = normalizeStroke(stroke);
      if (looksLikeTextGesture(normalized)) {
        const textElement = assignLayerToElement(
          createShapeFromStroke("text", normalized),
        );
        applyElementsWithInvariants((current) => [...current, textElement]);
        setSelection(makeSelection([textElement.id]));
        startInlineTextEdit(textElement);
        setStroke([]);
        setMarqueeSelection(null);
        setDragMode(null);
        setIsPanning(false);
        setHoveredElementId(null);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }
      if (isHorizontalScribbleStroke(normalized)) {
        const textElement = assignLayerToElement(
          createShapeFromStroke("text", normalized),
        );
        applyElementsWithInvariants((current) => [...current, textElement]);
        setSelection(makeSelection([textElement.id]));
        startInlineTextEdit(textElement);
        setStroke([]);
        setMarqueeSelection(null);
        setDragMode(null);
        setIsPanning(false);
        setHoveredElementId(null);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }
      const result = recognizeStroke(normalized);
      const decision = evaluateAmbiguity(normalized);
      const bounds = getStrokeBounds(normalized);
      const shouldKeepAsInkOnly =
        bounds.maxX - bounds.minX < 20 && bounds.maxY - bounds.minY < 20;
      if (shouldKeepAsInkOnly) {
        const inkElement = assignLayerToElement(createInk(normalized));
        applyElementsWithInvariants((current) => [...current, inkElement]);
        setSelection(makeSelection([inkElement.id]));
        setStroke([]);
        setMarqueeSelection(null);
        setDragMode(null);
        setIsPanning(false);
        setHoveredElementId(null);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }

      const threshold = 0.4;
      const fallbackKind: ShapeChoice =
        decision.kind === "line" ? "line" : "rect";
      const recognizedElement =
        result.kind !== "ink" && result.element && result.confidence >= threshold
          ? result.element
          : createShapeFromStroke(fallbackKind, normalized);
      const snappedElement = {
        ...assignLayerToElement(recognizedElement),
        x: snapToGrid(recognizedElement.x),
        y: snapToGrid(recognizedElement.y),
      };
      applyElementsWithInvariants((current) => {
        const nextElement =
          snappedElement.kind === "line"
            ? attachConnectorEndpoints(current, snappedElement)
            : snappedElement;
        return [...current, nextElement];
      });
      setSelection(makeSelection([snappedElement.id]));
      if (supportsInlineTextEditing(snappedElement)) {
        startInlineTextEdit(snappedElement);
      }
      setPendingDecision(decision);
      setPendingStroke(normalized);
      setPendingElementId(snappedElement.id);
      setStroke([]);
    }

    setMarqueeSelection(null);
    setDragMode(null);
    setResizeHandle(null);
    setIsPanning(false);
    setSnapGuide(null);
    setHoveredElementId(null);
    dragStartRef.current = null;
    lastPointerWorldRef.current = null;
  };

  const handleElementDoubleClick = (
    element: DiagramElement,
    event: ReactMouseEvent<HTMLElement | SVGElement>,
  ) => {
    if (readOnly) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    startInlineTextEdit(element);
  };

  const handleKeepInk = () => {
    if (readOnly) {
      return;
    }

    if (pendingStroke && pendingStroke.length > 1) {
      const inkElement = assignLayerToElement(createInk(pendingStroke));
      if (pendingElementId) {
        applyElementsWithInvariants((current) =>
          current.map((element) =>
            element.id === pendingElementId
              ? {
                  ...inkElement,
                  id: pendingElementId,
                }
              : element,
          ),
        );
        setSelection(makeSelection([pendingElementId]));
      } else {
        applyElementsWithInvariants((current) => [...current, inkElement]);
        setSelection(makeSelection([inkElement.id]));
      }
    }
    setPendingDecision(null);
    setPendingStroke(null);
    setPendingElementId(null);
  };

  const handleDismissFallback = () => {
    setPendingDecision(null);
    setPendingStroke(null);
    setPendingElementId(null);
  };

  const handleChooseShape = (kind: ShapeChoice) => {
    if (readOnly || !pendingStroke || pendingStroke.length < 2) {
      return;
    }

    const chosen = createShapeFromStroke(kind, pendingStroke);
    const snappedElement = {
      ...assignLayerToElement(chosen),
      x: snapToGrid(chosen.x),
      y: snapToGrid(chosen.y),
    };
    const activeId = pendingElementId ?? snappedElement.id;
    applyElementsWithInvariants((current) => {
      const nextElement =
        snappedElement.kind === "line"
          ? attachConnectorEndpoints(current, snappedElement)
          : snappedElement;
      if (pendingElementId) {
        return current.map((element) =>
          element.id === pendingElementId
            ? {
                ...nextElement,
                id: pendingElementId,
              }
            : element,
        );
      }
      return [...current, nextElement];
    });
    setSelection(makeSelection([activeId]));
    if (supportsInlineTextEditing(snappedElement)) {
      startInlineTextEdit(snappedElement);
    }
    setPendingDecision(null);
    setPendingStroke(null);
    setPendingElementId(null);
  };

  const commitTextEdit = useCallback(() => {
    if (!editingTextElementId) {
      return;
    }
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === editingTextElementId && supportsInlineTextEditing(element)
          ? {
              ...element,
              text: textDraft.trim(),
            }
          : element,
      ),
    );
    setEditingTextElementId(null);
  }, [applyElementsWithInvariants, editingTextElementId, textDraft]);

  const handleResizeStart = (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (readOnly) {
      return;
    }
    const targetElement =
      selectedElement && !isElementInteractionLocked(selectedElement)
        ? selectedElement
        : gizmoElement;
    if (!targetElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!surfaceRef.current) {
      return;
    }

    const rect = surfaceRef.current.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : rect.left;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : rect.top;
    const local = { x: clientX - rect.left, y: clientY - rect.top };
    lastPointerWorldRef.current = screenToWorld(local);
    setSelection(makeSelection([targetElement.id]));
    setResizeHandle(handle);
    resizeTargetIdRef.current = targetElement.id;
    rotateDragRef.current = null;
    setDragMode("resize");
  };

  const handleRotateStart = (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (readOnly || !surfaceRef.current) {
      return;
    }
    const targetElement =
      selectedElement && !isElementInteractionLocked(selectedElement)
        ? selectedElement
        : gizmoElement;
    if (!targetElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setSelection(makeSelection([targetElement.id]));
    const rect = surfaceRef.current.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : rect.left;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : rect.top;
    const local = { x: clientX - rect.left, y: clientY - rect.top };
    const world = screenToWorld(local);
    const center = {
      x: targetElement.x + targetElement.width / 2,
      y: targetElement.y + targetElement.height / 2,
    };
    const cornerX = handle.includes("e")
      ? targetElement.x + targetElement.width
      : targetElement.x;
    const cornerY = handle.includes("s")
      ? targetElement.y + targetElement.height
      : targetElement.y;
    const startReference = {
      x: cornerX,
      y: cornerY,
    };
    const startAngle = Math.atan2(
      world.y - center.y,
      world.x - center.x,
    ) || Math.atan2(startReference.y - center.y, startReference.x - center.x);
    rotateDragRef.current = {
      elementId: targetElement.id,
      center,
      startAngle,
      initialRotation: targetElement.rotation ?? 0,
    };
    setResizeHandle(null);
    setDragMode("rotate");
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

  const handleFitToContent = () => {
    if (!contentBounds) {
      setView(createViewState());
      return;
    }

    const contentWidth = Math.max(1, contentBounds.maxX - contentBounds.minX);
    const contentHeight = Math.max(1, contentBounds.maxY - contentBounds.minY);
    const nextScale = clampScale(
      Math.min(
        surfaceSize.width / (contentWidth + fitPadding * 2),
        surfaceSize.height / (contentHeight + fitPadding * 2),
      ),
    );
    const centerX = contentBounds.minX + contentWidth / 2;
    const centerY = contentBounds.minY + contentHeight / 2;

    setView({
      x: surfaceSize.width / 2 - centerX * nextScale,
      y: surfaceSize.height / 2 - centerY * nextScale,
      scale: nextScale,
    });
  };

  const panFromMinimapPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || minimapWidth;
    const height = rect.height || minimapHeight;
    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : left + width / 2;
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : top + height / 2;
    const ratioX = Math.max(0, Math.min(1, (pointerX - left) / width));
    const ratioY = Math.max(0, Math.min(1, (pointerY - top) / height));
    const worldX = ratioX * canvasWidth;
    const worldY = ratioY * canvasHeight;

    setView((current) => ({
      ...current,
      x: surfaceSize.width / 2 - worldX * current.scale,
      y: surfaceSize.height / 2 - worldY * current.scale,
    }));
  };

  const handleMinimapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsMinimapDragging(true);
    panFromMinimapPoint(event);
  };

  const handleMinimapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMinimapDragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    panFromMinimapPoint(event);
  };

  const handleMinimapPointerUp = () => {
    setIsMinimapDragging(false);
  };

  const cycleSelection = useCallback(
    (direction: 1 | -1) => {
      const nextId = getCycledSelectionId(elements, selection.ids[0], direction);
      if (!nextId) {
        return;
      }
      setSelection(makeSelection([nextId]));
    },
    [elements, selection.ids],
  );

  const nudgeSelection = useCallback(
    (dx: number, dy: number) => {
      if (selection.ids.length === 0) {
        return;
      }
      const unlockedSelectionIds = selection.ids.filter((id) => {
        const element = elements.find((item) => item.id === id);
        if (!element) {
          return false;
        }
        return !isElementInteractionLocked(element);
      });
      if (unlockedSelectionIds.length === 0) {
        return;
      }

      applyElementsWithInvariants((current) =>
        nudgeSelectedElements(current, unlockedSelectionIds, dx, dy),
      );
    },
    [applyElementsWithInvariants, elements, isElementInteractionLocked, selection.ids],
  );

  useEffect(() => {
    if (readOnly) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (key === "tab") {
        event.preventDefault();
        cycleSelection(event.shiftKey ? -1 : 1);
        return;
      }

      const nudgeStep = event.shiftKey ? 64 : 16;
      if (key === "arrowleft") {
        event.preventDefault();
        nudgeSelection(-nudgeStep, 0);
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        nudgeSelection(nudgeStep, 0);
        return;
      }
      if (key === "arrowup") {
        event.preventDefault();
        nudgeSelection(0, -nudgeStep);
        return;
      }
      if (key === "arrowdown") {
        event.preventDefault();
        nudgeSelection(0, nudgeStep);
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        return;
      }

      if (key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }

      if (key === "x") {
        event.preventDefault();
        cutSelection();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if (key === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        performUndo();
        return;
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        performRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    copySelection,
    cutSelection,
    cycleSelection,
    duplicateSelection,
    nudgeSelection,
    pasteClipboard,
    performRedo,
    performUndo,
    readOnly,
  ]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setIsOnboardingOpen(false);
      window.localStorage.setItem(onboardingDismissedStorageKey, "1");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOnboardingOpen]);

  const handleOpenOnboarding = () => {
    setIsOnboardingOpen(true);
  };

  const handleCloseOnboarding = () => {
    setIsOnboardingOpen(false);
    window.localStorage.setItem(onboardingDismissedStorageKey, "1");
  };

  const handleTitleChange = (value: string) => {
    setDocumentSettings((current) => ({
      ...current,
      title: value,
    }));
  };

  const handleBackgroundChange = (value: string) => {
    setDocumentSettings((current) => ({
      ...current,
      background: value || defaultCanvasBackground,
    }));
  };

  const handleCanvasHintChange = (axis: "width" | "height", value: string) => {
    const parsed = Number.parseInt(value, 10);
    setDocumentSettings((current) => ({
      ...current,
      canvas: {
        ...current.canvas,
        [axis]: Number.isFinite(parsed) ? parsed : undefined,
      },
    }));
  };

  const updateLayers = (updater: (current: EditorLayer[]) => EditorLayer[]) => {
    setDocumentSettings((current) => {
      const currentLayers =
        current.layers && current.layers.length > 0
          ? current.layers
          : [createDefaultLayer()];
      const nextLayers = updater(currentLayers);
      return {
        ...current,
        layers: nextLayers.length > 0 ? nextLayers : [createDefaultLayer()],
      };
    });
  };

  const handleCreateLayer = () => {
    const nextLayer: EditorLayer = {
      id: crypto.randomUUID(),
      name: `Layer ${layers.length + 1}`,
      color: defaultLayerColor,
      visible: true,
      locked: false,
    };
    updateLayers((current) => [...current, nextLayer]);
    setActiveLayerId(nextLayer.id);
  };

  const handleRenameLayer = (layerId: string, name: string) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.id === layerId
          ? { ...layer, name: name.trim().length > 0 ? name : layer.name }
          : layer,
      ),
    );
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      ),
    );
  };

  const handleToggleLayerLock = (layerId: string) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.id === layerId ? { ...layer, locked: !layer.locked } : layer,
      ),
    );
  };

  const handleLayerColorChange = (layerId: string, color: string) => {
    updateLayers((current) =>
      current.map((layer) => (layer.id === layerId ? { ...layer, color } : layer)),
    );
  };

  const reorderLayers = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }
    const maxIndex = layers.length - 1;
    if (fromIndex > maxIndex || toIndex > maxIndex) {
      return;
    }

    const reordered = [...layers];
    const [movedLayer] = reordered.splice(fromIndex, 1);
    if (!movedLayer) {
      return;
    }
    reordered.splice(toIndex, 0, movedLayer);
    updateLayers(() => reordered);

    const nextIndexById = new Map(reordered.map((layer, index) => [layer.id, index]));
    applyElementsWithInvariants((current) =>
      current.map((element) => {
        const currentLayer = element.layer ?? 0;
        const currentLayerId = layers[currentLayer]?.id;
        if (!currentLayerId) {
          return element;
        }
        const nextLayerIndex = nextIndexById.get(currentLayerId);
        if (nextLayerIndex === undefined) {
          return element;
        }
        return {
          ...element,
          layer: nextLayerIndex,
        };
      }),
    );
  };

  const handleDeleteLayer = (layerId: string) => {
    const layerIndex = layerIndexById.get(layerId);
    if (layerIndex === undefined || layers.length <= 1) {
      return;
    }
    const hasLayerElements = elements.some((element) => (element.layer ?? 0) === layerIndex);
    if (
      hasLayerElements &&
      !window.confirm("Delete this layer and move its elements to Layer 1?")
    ) {
      return;
    }

    const nextLayers = layers.filter((layer) => layer.id !== layerId);
    const nextIndexById = new Map(nextLayers.map((layer, index) => [layer.id, index]));
    updateLayers(() => nextLayers);
    setActiveLayerId((current) =>
      current === layerId ? (nextLayers[0]?.id ?? "") : current,
    );

    applyElementsWithInvariants((current) =>
      current.map((element) => {
        const currentLayer = element.layer ?? 0;
        const currentLayerId = layers[currentLayer]?.id;
        if (!currentLayerId || currentLayerId === layerId) {
          return {
            ...element,
            layer: 0,
          };
        }
        const nextLayer = nextIndexById.get(currentLayerId);
        if (nextLayer === undefined) {
          return {
            ...element,
            layer: 0,
          };
        }
        return {
          ...element,
          layer: nextLayer,
        };
      }),
    );
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
        <button type="button" onClick={handleFitToContent}>
          Fit to Content
        </button>
        <button type="button" onClick={performUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={performRedo} disabled={!canRedo}>
          Redo
        </button>
        {!readOnly && (
          <button type="button" onClick={handleOpenOnboarding}>
            Cheat Sheet
          </button>
        )}
        <span aria-live="polite">
          Zoom: {summary.scale.toFixed(2)} | Selected: {summary.selected}
        </span>
      </div>
      {!readOnly && isOnboardingOpen && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Editor onboarding">
          <div className="onboarding-panel">
            <h2>Getting started</h2>
            <p>Use gestures, shortcuts, and context tools to build diagrams quickly.</p>
            <div className="onboarding-sections">
              <section>
                <h3>Gestures</h3>
                <ul>
                  <li>Draw on the canvas to recognize a shape.</li>
                  <li>Tap empty space to create a text box.</li>
                  <li>Drag from shape to move it; hold Alt to disable snapping.</li>
                </ul>
              </section>
              <section>
                <h3>Keyboard</h3>
                <ul>
                  <li>Ctrl/Cmd + C/X/V: copy, cut, paste</li>
                  <li>Ctrl/Cmd + D: duplicate selection</li>
                  <li>Ctrl/Cmd + Z / Shift+Z: undo/redo</li>
                  <li>Arrow keys: nudge selected shape (Shift for larger step)</li>
                </ul>
              </section>
              <section>
                <h3>Interaction patterns</h3>
                <ul>
                  <li>Double-click any shape to edit its label inline.</li>
                  <li>Use the context palette for convert, style, lock, and delete actions.</li>
                  <li>Use layer panel controls to organize visibility and locking.</li>
                </ul>
              </section>
            </div>
            <div className="onboarding-actions">
              <button type="button" onClick={handleCloseOnboarding}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      {!readOnly && (
        <fieldset className="document-settings-panel" aria-label="Document settings">
          <legend>Document settings</legend>
          <label>
            Title
            <input
              aria-label="Document title"
              value={documentSettings.title ?? ""}
              onChange={(event) => handleTitleChange(event.target.value)}
            />
          </label>
          <label>
            Background
            <input
              aria-label="Document background color"
              type="color"
              value={documentSettings.background ?? defaultCanvasBackground}
              onChange={(event) => handleBackgroundChange(event.target.value)}
            />
          </label>
          <label>
            Canvas width hint
            <input
              aria-label="Canvas width hint"
              type="number"
              min={1}
              value={documentSettings.canvas?.width ?? ""}
              onChange={(event) => handleCanvasHintChange("width", event.target.value)}
            />
          </label>
          <label>
            Canvas height hint
            <input
              aria-label="Canvas height hint"
              type="number"
              min={1}
              value={documentSettings.canvas?.height ?? ""}
              onChange={(event) => handleCanvasHintChange("height", event.target.value)}
            />
          </label>
        </fieldset>
      )}

      {!readOnly && (
        <fieldset className="layer-panel" aria-label="Layer panel">
          <legend>Layers</legend>
          <div className="layer-panel-actions">
            <button type="button" onClick={handleCreateLayer}>
              Add Layer
            </button>
          </div>
          <ul className="layer-list">
            {layers.map((layer, index) => {
              const hasContent = elements.some((element) => (element.layer ?? 0) === index);
              return (
                <li
                  key={layer.id}
                  className="layer-row"
                  draggable
                  onDragStart={() => {
                    draggedLayerIdRef.current = layer.id;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    const fromId = draggedLayerIdRef.current;
                    if (!fromId) {
                      return;
                    }
                    const fromIndex = layerIndexById.get(fromId);
                    if (fromIndex === undefined) {
                      return;
                    }
                    reorderLayers(fromIndex, index);
                    draggedLayerIdRef.current = null;
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Select ${layer.name}`}
                    className={activeLayerId === layer.id ? "layer-select active" : "layer-select"}
                    onClick={() => setActiveLayerId(layer.id)}
                  >
                    ●
                  </button>
                  <input
                    aria-label={`Layer name ${index + 1}`}
                    value={layer.name}
                    onChange={(event) => handleRenameLayer(layer.id, event.target.value)}
                  />
                  <input
                    aria-label={`Layer color ${index + 1}`}
                    type="color"
                    value={layer.color}
                    onChange={(event) => handleLayerColorChange(layer.id, event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={`Toggle visibility ${layer.name}`}
                    onClick={() => handleToggleLayerVisibility(layer.id)}
                  >
                    {layer.visible ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Toggle lock ${layer.name}`}
                    onClick={() => handleToggleLayerLock(layer.id)}
                  >
                    {layer.locked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${layer.name}`}
                    disabled={layers.length <= 1}
                    onClick={() => handleDeleteLayer(layer.id)}
                  >
                    Delete
                  </button>
                  {hasContent ? <span className="layer-count">●</span> : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {!readOnly && (
        <DocumentPersistenceControls
          onSave={handleSave}
          onLoad={handleLoad}
          onExportYaml={handleExport}
          onExportSvg={handleExportSvg}
          onExportPng={handleExportPng}
          onExportPdf={handleExportPdf}
          onImport={handleImport}
        />
      )}

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

      {pendingDecision && (
        <GestureFallbackPanel
          message={`Pick a shape style or keep as ink (${pendingDecision.confidence.toFixed(2)} confidence).`}
          onKeepInk={handleKeepInk}
          onRetryRecognition={handleDismissFallback}
          onChooseShape={handleChooseShape}
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
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredElementId(null)}
        onWheel={handleWheel}
      >
        {selectedActions.length > 0 && (
          <ContextPalette
            actions={selectedActions}
            profileId={profileId}
            onAction={handlePaletteAction}
            selectedKind={shouldShowShapeCustomizer ? selectedElement?.kind : undefined}
            selectedColor={
              shouldShowShapeCustomizer
                ? selectedElement?.color ?? paletteColorSwatches[0]
                : undefined
            }
            selectedStyleVariant={shouldShowShapeCustomizer ? selectedStyleVariant ?? undefined : undefined}
            position={shouldShowShapeCustomizer ? palettePosition ?? undefined : undefined}
            colorSwatches={shouldShowShapeCustomizer ? paletteColorSwatches : []}
            onConvertKind={shouldShowShapeCustomizer ? handleConvertKind : undefined}
            onSelectColor={shouldShowShapeCustomizer ? handleSelectColor : undefined}
            onSelectStyleVariant={
              shouldShowShapeCustomizer ? handleSelectStyleVariant : undefined
            }
          />
        )}

        <div
          aria-label="Minimap"
          role="application"
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={handleMinimapPointerUp}
          onPointerLeave={handleMinimapPointerUp}
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: `${minimapWidth}px`,
            height: `${minimapHeight}px`,
            zIndex: 20,
            background: "var(--gd-minimap-bg, rgba(17, 24, 39, 0.78))",
            border: "1px solid var(--gd-minimap-border, rgba(255,255,255,0.2))",
            borderRadius: 8,
            overflow: "hidden",
            cursor: "pointer",
          }}
        >
          {elements.map((element) => (
            <div
              key={`minimap-${element.id}`}
              style={{
                position: "absolute",
                left: (element.x / canvasWidth) * minimapWidth,
                top: (element.y / canvasHeight) * minimapHeight,
                width: Math.max(2, (element.width / canvasWidth) * minimapWidth),
                height: Math.max(2, (element.height / canvasHeight) * minimapHeight),
                background:
                  selection.ids.includes(element.id)
                    ? "var(--gd-color-selection-handle-border)"
                    : "var(--gd-minimap-shape, rgba(229, 231, 235, 0.75))",
                borderRadius: 2,
              }}
            />
          ))}
          <div
            aria-label="Viewport indicator"
            style={{
              position: "absolute",
              left: (viewportBounds.minX / canvasWidth) * minimapWidth,
              top: (viewportBounds.minY / canvasHeight) * minimapHeight,
              width: (viewportBounds.width / canvasWidth) * minimapWidth,
              height: (viewportBounds.height / canvasHeight) * minimapHeight,
              border: "1px solid var(--gd-color-connection-port-bg)",
              background: "var(--gd-minimap-viewport-bg, rgba(34, 211, 238, 0.12))",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          className="viewport"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            background: documentSettings.background ?? defaultCanvasBackground,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div className="grid" aria-hidden="true" />
          <ConnectionPorts
            ports={hoveredPorts}
            onPortPointerDown={handlePortPointerDown}
          />
          {marqueeSelection && (
            <div
              aria-label="Selection marquee"
              style={{
                position: "absolute",
                left: Math.min(marqueeSelection.start.x, marqueeSelection.end.x),
                top: Math.min(marqueeSelection.start.y, marqueeSelection.end.y),
                width: Math.abs(marqueeSelection.end.x - marqueeSelection.start.x),
                height: Math.abs(marqueeSelection.end.y - marqueeSelection.start.y),
                border: "1px dashed var(--gd-marquee-border, #38bdf8)",
                background: "var(--gd-marquee-bg, rgba(56, 189, 248, 0.15))",
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            />
          )}
          {snapGuide && (
            <div
              aria-label="Snap guide"
              style={{
                position: "absolute",
                ...(snapGuide.axis === "x"
                  ? {
                      left: snapGuide.position,
                      top: 0,
                      width: 1,
                      height: canvasHeight,
                    }
                  : {
                      left: 0,
                      top: snapGuide.position,
                      width: canvasWidth,
                      height: 1,
                    }),
                background: "var(--gd-color-selection-handle-border)",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          )}
          {connectionDrag && (
            <svg
              aria-label="Connector preview"
              style={{
                position: "absolute",
                inset: 0,
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                pointerEvents: "none",
                overflow: "visible",
              }}
            >
              <line
                x1={connectionDrag.start.x}
                y1={connectionDrag.start.y}
                x2={connectionDrag.current.x}
                y2={connectionDrag.current.y}
                stroke="var(--gd-color-connection-port-bg)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            </svg>
          )}
          {visibleElements.map((element) => {
            const isSelected = selection.ids.includes(element.id);
            const isConnectionTarget = connectionDrag?.targetId === element.id;
            const strokeWidth = element.strokeWidth ?? 2;
            const baseColor = element.color ?? "var(--gd-element-stroke, #1f2937)";
            const selectedColor = "var(--gd-color-selection-handle-border)";
            const borderColor = isConnectionTarget
              ? "var(--gd-color-connection-port-bg)"
              : isSelected
                ? selectedColor
                : baseColor;
            const styleVariant = element.styleVariant ?? getDefaultStyleVariant(element.kind);
            const isFilledStyle = styleVariant === "filled";
            const isDashedStyle = styleVariant === "dashed";
            const style: CSSProperties = {
              position: "absolute",
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              borderWidth: strokeWidth,
              borderStyle: isDashedStyle ? "dashed" : "solid",
              borderColor,
              background: isFilledStyle
                ? "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                : "transparent",
              borderRadius: element.kind === "rect" ? 8 : 0,
              boxSizing: "border-box",
              transform: `rotate(${element.rotation ?? 0}deg)`,
              transformOrigin: "center",
              cursor: isSelected ? (dragMode === "rotate" ? "grabbing" : "move") : "pointer",
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
                        borderColor
                      }`,
                      borderTopStyle: isDashedStyle ? "dashed" : "solid",
                      borderLeft: "0",
                      borderRight: "0",
                      borderBottom: "0",
                      boxShadow:
                        "inset 0 0 0 1px var(--gd-element-line-shadow, rgba(17, 24, 39, 0.15))",
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
                    stroke={borderColor}
                    strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              );
            }

            const centeredLabelStyle: CSSProperties = {
              position: "absolute",
              inset: 0,
              padding: "8px 10px",
              color: baseColor,
              fontSize: "14px",
              lineHeight: "18px",
              textAlign: "center",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              userSelect: "none",
              boxSizing: "border-box",
            };

            if (element.kind === "diamond") {
              return (
                <div
                  key={element.id}
                  aria-label={`Shape ${element.kind}`}
                  style={{
                    position: "absolute",
                    left: element.x,
                    top: element.y,
                    width: element.width,
                    height: element.height,
                    overflow: "visible",
                    transform: `rotate(${element.rotation ?? 0}deg)`,
                    transformOrigin: "center",
                    cursor: isSelected ? (dragMode === "rotate" ? "grabbing" : "move") : "pointer",
                  }}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                    }}
                  >
                    <polygon
                      points={`${element.width / 2},0 ${element.width},${element.height / 2} ${element.width / 2},${element.height} 0,${element.height / 2}`}
                      fill={
                        isFilledStyle
                          ? "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                          : "transparent"
                      }
                      stroke={borderColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isDashedStyle ? "8 5" : undefined}
                    />
                  </svg>
                  {element.text?.trim() ? (
                    <div style={centeredLabelStyle}>{element.text}</div>
                  ) : null}
                </div>
              );
            }

            if (element.kind === "triangle") {
              return (
                <div
                  key={element.id}
                  aria-label={`Shape ${element.kind}`}
                  style={{
                    position: "absolute",
                    left: element.x,
                    top: element.y,
                    width: element.width,
                    height: element.height,
                    overflow: "visible",
                    transform: `rotate(${element.rotation ?? 0}deg)`,
                    transformOrigin: "center",
                    cursor: isSelected ? (dragMode === "rotate" ? "grabbing" : "move") : "pointer",
                  }}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                    }}
                  >
                    <polygon
                      points={`${element.width / 2},0 ${element.width},${element.height} 0,${element.height}`}
                      fill={
                        isFilledStyle
                          ? "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                          : "transparent"
                      }
                      stroke={borderColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isDashedStyle ? "8 5" : undefined}
                    />
                  </svg>
                  {element.text?.trim() ? (
                    <div style={centeredLabelStyle}>{element.text}</div>
                  ) : null}
                </div>
              );
            }

            if (element.kind === "text") {
              return (
                <div
                  key={element.id}
                  aria-label={`Shape ${element.kind}`}
                  style={style}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      border: `1px ${isDashedStyle ? "dashed" : "solid"} ${borderColor}`,
                      background: isFilledStyle
                        ? "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                        : "transparent",
                      padding: "6px 8px",
                      color: baseColor,
                      fontSize: "14px",
                      lineHeight: "18px",
                      overflow: "hidden",
                      boxSizing: "border-box",
                      userSelect: "none",
                      whiteSpace: "pre-wrap",
                      textAlign: "center",
                      wordBreak: "break-word",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {element.text && element.text.length > 0
                      ? element.text
                      : "Type text"}
                  </div>
                </div>
              );
            }

            if (element.kind === "container") {
              return (
                <div
                  key={element.id}
                  aria-label={`Shape ${element.kind}`}
                  style={{
                    ...style,
                    borderColor,
                    background: isFilledStyle
                      ? "rgba(148, 163, 184, 0.08)"
                      : "transparent",
                  }}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  {element.text?.trim() ? (
                    <div style={centeredLabelStyle}>{element.text}</div>
                  ) : null}
                </div>
              );
            }

            if (element.kind === "ellipse") {
              return (
                <div
                  key={element.id}
                  aria-label={`Shape ${element.kind}`}
                  style={{
                    ...style,
                    borderRadius: "50%",
                    background: isFilledStyle
                      ? "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                      : "transparent",
                  }}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  {element.text?.trim() ? (
                    <div style={centeredLabelStyle}>{element.text}</div>
                  ) : null}
                </div>
              );
            }

            return (
              <div
                key={element.id}
                aria-label={`Shape ${element.kind}`}
                style={style}
                onDoubleClick={(event) => handleElementDoubleClick(element, event)}
              >
                {element.text?.trim() ? (
                  <div style={centeredLabelStyle}>{element.text}</div>
                ) : null}
              </div>
            );
          })}

          {visibleElements
            .filter((element) => isElementInteractionLocked(element))
            .map((element) => (
              <div
                key={`lock-${element.id}`}
                aria-label="Locked element"
                title="Locked element"
                style={{
                  position: "absolute",
                  left: element.x + element.width - 18,
                  top: element.y - 10,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: "1px solid var(--gd-color-selection-handle-border)",
                  background: "var(--gd-color-surface)",
                  color: "var(--gd-color-selection-handle-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  lineHeight: 1,
                  zIndex: 12,
                  pointerEvents: "none",
                }}
              >
                🔒
              </div>
            ))}

          {gizmoElement && (
            <SelectionHandles
              x={gizmoElement.x}
              y={gizmoElement.y}
              width={gizmoElement.width}
              height={gizmoElement.height}
              onResizeStart={handleResizeStart}
              onRotateStart={handleRotateStart}
              isRotating={dragMode === "rotate"}
            />
          )}

          {dragMode === "draw" && strokeGhost && (
            <>
              {strokeGhost.kind === "line" ? (
                <div
                  aria-label={`Ghost preview ${strokeGhost.kind}`}
                  style={{
                    position: "absolute",
                    left: strokeGhost.x,
                    top: strokeGhost.y,
                    width: strokeGhost.width,
                    height: strokeGhost.height,
                    borderTop: `2px dashed ${strokeGhost.color ?? "var(--gd-stroke-preview, #2563eb)"}`,
                    opacity: 0.55,
                    pointerEvents: "none",
                  }}
                />
              ) : strokeGhost.kind === "diamond" || strokeGhost.kind === "triangle" ? (
                <div
                  aria-label={`Ghost preview ${strokeGhost.kind}`}
                  style={{
                    position: "absolute",
                    left: strokeGhost.x,
                    top: strokeGhost.y,
                    width: strokeGhost.width,
                    height: strokeGhost.height,
                    opacity: 0.45,
                    pointerEvents: "none",
                  }}
                >
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                    }}
                  >
                    {strokeGhost.kind === "diamond" ? (
                      <polygon
                        points={`${strokeGhost.width / 2},0 ${strokeGhost.width},${strokeGhost.height / 2} ${strokeGhost.width / 2},${strokeGhost.height} 0,${strokeGhost.height / 2}`}
                        fill="var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                        stroke={strokeGhost.color ?? "var(--gd-stroke-preview, #2563eb)"}
                        strokeWidth={2}
                        strokeDasharray="8 5"
                      />
                    ) : (
                      <polygon
                        points={`${strokeGhost.width / 2},0 ${strokeGhost.width},${strokeGhost.height} 0,${strokeGhost.height}`}
                        fill="var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))"
                        stroke={strokeGhost.color ?? "var(--gd-stroke-preview, #2563eb)"}
                        strokeWidth={2}
                        strokeDasharray="8 5"
                      />
                    )}
                  </svg>
                </div>
              ) : (
                <div
                  aria-label={`Ghost preview ${strokeGhost.kind}`}
                  style={{
                    position: "absolute",
                    left: strokeGhost.x,
                    top: strokeGhost.y,
                    width: strokeGhost.width,
                    height: strokeGhost.height,
                    border: `2px dashed ${strokeGhost.color ?? "var(--gd-stroke-preview, #2563eb)"}`,
                    borderRadius: strokeGhost.kind === "ellipse" ? "50%" : 8,
                    background: "var(--gd-element-rect-fill, rgba(79, 70, 229, 0.12))",
                    opacity: 0.45,
                    pointerEvents: "none",
                  }}
                />
              )}
            </>
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
                stroke="var(--gd-stroke-preview, #2563eb)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {editingTextElementId &&
            (() => {
              const editingElement = elements.find(
                (element) =>
                  element.id === editingTextElementId &&
                  supportsInlineTextEditing(element),
              );
              if (!editingElement) {
                return null;
              }
              return (
                <textarea
                  aria-label="Edit text element"
                  autoFocus
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  onBlur={commitTextEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingTextElementId(null);
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      commitTextEdit();
                    }
                  }}
                  style={{
                    position: "absolute",
                    left: editingElement.x,
                    top: editingElement.y,
                    width: editingElement.width,
                    height: editingElement.height,
                    resize: "none",
                    border: "1px solid var(--gd-color-selection-handle-border)",
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontSize: "14px",
                    lineHeight: "18px",
                    fontFamily: "inherit",
                    color: "var(--gd-color-text)",
                    background: "var(--gd-color-surface)",
                    boxSizing: "border-box",
                    zIndex: 30,
                  }}
                />
              );
            })()}
        </div>
      </div>
    </div>
  );
}
