import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
  COLLAPSED_CONTAINER_HEIGHT,
  CONTAINER_PADDING,
  collectOwnedDescendantIds,
  getGroupedSelectionIds,
  groupElements,
  inheritLayerFromParents,
  moveGroupedElements,
  releaseChildrenFromParents,
  reconcileContainerOwnership,
  ungroupElements,
} from "../editor/grouping";
import { normalizeStroke } from "../editor/input";
import { applyAutoLayout, type AutoLayoutAlgorithm } from "../editor/layout";
import {
  builtInLibraryShapes,
  findLibraryShapeById,
  getBuiltInLibraryCategories,
} from "../editor/library";
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
import { exportDrawIo } from "../editor/export/drawio";
import { importDrawIo } from "../editor/import/drawio";
import { importMermaid } from "../editor/import/mermaid";
import { assertNoCircularParentReferences } from "../editor/import/security";
import {
  getCycledSelectionId,
  nudgeSelectedElements,
} from "../editor/keyboardNavigation";
import {
  applyLinkToSelection,
  parseRichTextSegments,
  toggleTextWrap,
  type TextSelectionPatch,
} from "../editor/richText";
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
import type {
  DiagramDocument,
  DiagramElement,
  DiagramStyleToken,
  Point,
} from "../editor/types";
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
const baseTextFontSize = 14;
const baseTextLineHeight = 18;
const textPaddingX = 16;
const textPaddingY = 12;

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
type CopiedStyle = Pick<DiagramElement, "color" | "styleVariant">;

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

function createShapeFromLibrary(
  shapeId: string,
  x: number,
  y: number,
): DiagramElement | null {
  const definition = findLibraryShapeById(shapeId);
  if (!definition) {
    return null;
  }

  const left = x - definition.width / 2;
  const top = y - definition.height / 2;
  if (definition.kind === "ellipse") {
    return {
      ...createEllipse(left, top, definition.width, definition.height),
      text: definition.name,
    };
  }
  if (definition.kind === "diamond") {
    return {
      ...createDiamond(left, top, definition.width, definition.height),
      text: definition.name,
    };
  }
  if (definition.kind === "triangle") {
    return {
      ...createTriangle(left, top, definition.width, definition.height),
      text: definition.name,
    };
  }
  if (definition.kind === "container") {
    return {
      ...createContainer(left, top, definition.width, definition.height),
      text: definition.name,
    };
  }
  if (definition.kind === "text") {
    return {
      ...createText(left, top, definition.width, definition.height),
      text: definition.name,
    };
  }
  return {
    ...createRectangle(left, top, definition.width, definition.height),
    text: definition.name,
  };
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

function isHiddenByCollapsedAncestor(
  element: DiagramElement,
  elementsById: Map<string, DiagramElement>,
): boolean {
  let parentId = element.parentId;
  const visited = new Set<string>();

  while (parentId) {
    if (visited.has(parentId)) {
      return false;
    }
    visited.add(parentId);
    const parent = elementsById.get(parentId);
    if (!parent) {
      return false;
    }
    if (parent.kind === "container" && parent.collapsed) {
      return true;
    }
    parentId = parent.parentId;
  }

  return false;
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

function isConnectableElement(element: DiagramElement): boolean {
  return element.kind !== "line" && element.kind !== "ink";
}

type TextAlignHorizontal = "left" | "center" | "right";
type TextAlignVertical = "top" | "middle" | "bottom";
type TextOverflowMode = "grow-shape" | "shrink-text";
type ConnectorRouting = "straight" | "orthogonal" | "curved";

function resolveTextAlignmentFromClick(
  element: DiagramElement,
  point: Point,
): { horizontal: TextAlignHorizontal; vertical: TextAlignVertical } {
  const relativeX = (point.x - element.x) / Math.max(element.width, 1);
  const relativeY = (point.y - element.y) / Math.max(element.height, 1);

  const horizontal: TextAlignHorizontal =
    relativeX <= 0.33 ? "left" : relativeX >= 0.67 ? "right" : "center";
  const vertical: TextAlignVertical =
    relativeY <= 0.33 ? "top" : relativeY >= 0.67 ? "bottom" : "middle";

  return { horizontal, vertical };
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

function createDefaultStyleToken(index: number): DiagramStyleToken {
  return {
    id: crypto.randomUUID(),
    name: `Token ${index}`,
    color: "#4f46e5",
    fontSize: 14,
    strokeWidth: 2,
  };
}

function resolveTextOverflowMode(element: DiagramElement): TextOverflowMode {
  return element.textOverflowMode ?? "grow-shape";
}

function resolveConnectorRouting(element: DiagramElement): ConnectorRouting {
  return element.connectorRouting ?? "straight";
}

function estimateTextLineCount(text: string, width: number): number {
  const usableWidth = Math.max(24, width - textPaddingX);
  const approxCharsPerLine = Math.max(1, Math.floor(usableWidth / 7));
  return text.split("\n").reduce((total, rawLine) => {
    const lineLength = Math.max(rawLine.length, 1);
    return total + Math.max(1, Math.ceil(lineLength / approxCharsPerLine));
  }, 0);
}

function getAutoGrowHeightForText(text: string, width: number): number {
  const lineCount = estimateTextLineCount(text, width);
  return Math.max(32, lineCount * baseTextLineHeight + textPaddingY);
}

function resolveShrinkTextFontSize(
  text: string,
  width: number,
  height: number,
  baseFontSize = baseTextFontSize,
): { fontSize: number; lineHeight: number } {
  const lineCount = estimateTextLineCount(text, width);
  const usableHeight = Math.max(24, height - textPaddingY);
  const estimatedHeightAtBase = Math.max(1, lineCount * baseTextLineHeight);
  const scale = Math.min(1, usableHeight / estimatedHeightAtBase);
  const fontSize = Math.max(10, Math.round(baseFontSize * scale));
  return {
    fontSize,
    lineHeight: Math.max(12, Math.round(fontSize * 1.3)),
  };
}

type EditorSurfaceProps = {
  document?: DiagramDocument;
  readOnly?: boolean;
  profileId?: string;
  initialSelectionIds?: string[];
  onDocumentChange?: (document: DiagramDocument) => void;
};

export function EditorSurface({
  document,
  readOnly = false,
  profileId,
  initialSelectionIds,
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
      styleTokens:
        document?.settings?.styleTokens?.map((token) => ({ ...token })) ?? [],
    }),
    [
      document?.settings?.background,
      document?.settings?.canvas?.height,
      document?.settings?.canvas?.width,
      document?.settings?.layers,
      document?.settings?.styleTokens,
      document?.settings?.title,
    ],
  );
  const [view, setView] = useState<ViewState>(createViewState());
  const [elements, setElements] = useState<DiagramElement[]>(
    document ? [...document.elements] : [],
  );
  const [selection, setSelection] = useState(makeSelection(initialSelectionIds ?? []));
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
  const [containerDropTargetId, setContainerDropTargetId] = useState<string | null>(
    null,
  );
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
    null,
  );
  const [keyboardConnectSourceId, setKeyboardConnectSourceId] = useState<string | null>(
    null,
  );
  const rotateDragRef = useRef<RotateDragState | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState(false);
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState("");
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
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
  const draggedOutlineElementIdRef = useRef<string | null>(null);
  const resizeTargetIdRef = useRef<string | null>(null);
  const [outlineFilter, setOutlineFilter] = useState("");
  const [collapsedOutlineLayers, setCollapsedOutlineLayers] = useState<string[]>([]);
  const [collapsedOutlineGroups, setCollapsedOutlineGroups] = useState<string[]>([]);
  const [isLayoutDialogOpen, setIsLayoutDialogOpen] = useState(false);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);

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

  const styleTokens = useMemo(
    () => documentSettings.styleTokens ?? [],
    [documentSettings.styleTokens],
  );

  const styleTokenById = useMemo(
    () => new Map(styleTokens.map((token) => [token.id, token])),
    [styleTokens],
  );

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

  const { renderableElements, hiddenConnectionIndicatorByElementId } = useMemo(() => {
    const layerVisibleElements = elements.filter((element) => {
      const layerIndex = element.layer ?? 0;
      return (layerByIndex.get(layerIndex)?.visible ?? true) && !element.hidden;
    });
    const visibleElementsById = new Map(
      layerVisibleElements.map((element) => [element.id, element]),
    );
    const visibleElementIds = new Set(layerVisibleElements.map((element) => element.id));
    const baseRenderableElements = layerVisibleElements.filter(
      (element) => !isHiddenByCollapsedAncestor(element, visibleElementsById),
    );
    const baseRenderableIds = new Set(baseRenderableElements.map((element) => element.id));
    const hiddenConnectionIndicatorCounts = new Map<string, number>();

    elements.forEach((element) => {
      if (element.kind !== "line" || !element.connector) {
        return;
      }
      const fromVisible = visibleElementIds.has(element.connector.fromId);
      const toVisible = visibleElementIds.has(element.connector.toId);
      if (fromVisible === toVisible) {
        return;
      }
      const visibleEndpointId = fromVisible ? element.connector.fromId : element.connector.toId;
      if (!baseRenderableIds.has(visibleEndpointId)) {
        return;
      }
      hiddenConnectionIndicatorCounts.set(
        visibleEndpointId,
        (hiddenConnectionIndicatorCounts.get(visibleEndpointId) ?? 0) + 1,
      );
    });

    const nextRenderableElements = baseRenderableElements.filter((element) => {
      if (element.kind !== "line" || !element.connector) {
        return true;
      }
      return (
        visibleElementIds.has(element.connector.fromId) &&
        visibleElementIds.has(element.connector.toId)
      );
    });

    return {
      renderableElements: nextRenderableElements,
      hiddenConnectionIndicatorByElementId: hiddenConnectionIndicatorCounts,
    };
  }, [elements, layerByIndex]);

  const visibleElements = useMemo(
    () => getVisibleElements(renderableElements, view, surfaceSize),
    [renderableElements, surfaceSize, view],
  );

  const accessibleElementLabelById = useMemo(() => {
    const shapeElements = renderableElements.filter(isConnectableElement);
    const shapeIndexById = new Map(
      shapeElements.map((element, index) => [element.id, index + 1]),
    );
    const shapeLabelById = new Map<string, string>();
    shapeElements.forEach((element) => {
      const fallbackIndex = shapeIndexById.get(element.id) ?? 0;
      const fallbackLabel = `${element.kind} ${fallbackIndex}`;
      shapeLabelById.set(element.id, element.text?.trim() || fallbackLabel);
    });

    const labels = new Map<string, string>();
    renderableElements.forEach((element) => {
      if (element.kind === "line") {
        const from = element.connector?.fromId
          ? shapeLabelById.get(element.connector.fromId) ?? "unknown source"
          : null;
        const to = element.connector?.toId
          ? shapeLabelById.get(element.connector.toId) ?? "unknown target"
          : null;
        labels.set(
          element.id,
          from && to
            ? `Connector from ${from} to ${to}`
            : "Connector",
        );
        return;
      }
      if (element.kind === "ink") {
        labels.set(element.id, "Ink stroke");
        return;
      }
      labels.set(
        element.id,
        `${element.kind} shape: ${shapeLabelById.get(element.id) ?? element.kind}`,
      );
    });
    return labels;
  }, [renderableElements]);

  const screenReaderSummary = useMemo(() => {
    const shapeCount = renderableElements.filter(isConnectableElement).length;
    const connectorElements = renderableElements.filter(
      (element) => element.kind === "line" && element.connector,
    );
    const connectorCount = connectorElements.length;
    const connectorSummary = connectorElements
      .map((element) => accessibleElementLabelById.get(element.id))
      .filter((label): label is string => Boolean(label))
      .join(". ");

    const parts = [
      `${shapeCount} shapes`,
      `${connectorCount} connectors`,
      `selection size ${selection.ids.length}`,
    ];
    if (connectorSummary) {
      parts.push(connectorSummary);
    }
    return parts.join(". ");
  }, [accessibleElementLabelById, renderableElements, selection.ids.length]);

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

    const expandedSelectionIds = new Set(
      getGroupedSelectionIds(elements, selection.ids),
    );
    const selectedElements = elements.filter((element) =>
      expandedSelectionIds.has(element.id),
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
    const canArrange = selectedElements.length > 1;
    const canCopyStyle =
      selectedElements.length === 1 &&
      selectedElements[0]?.kind !== "ink" &&
      !isElementInteractionLocked(selectedElements[0]);
    const primaryLayerIndex = selectedElements[0]?.layer ?? 0;
    const selectedContainer =
      selectedElements.length === 1 && selectedElements[0]?.kind === "container"
        ? selectedElements[0]
        : null;
    const currentLayoutMode = selectedContainer?.containerLayoutMode ?? "free";

    const nextActions: PaletteAction[] = [
      { id: "duplicate", label: "Duplicate", kind: "duplicate", rank: 1 },
      ...(canCopyStyle
        ? [
              {
                id: "copy-style",
                label: isFormatPainterActive ? "Copy Style (Armed)" : "Copy Style",
                kind: "copy-style" as const,
                rank: 2,
              },
            ]
        : []),
      ...(canArrange
        ? [
              { id: "align-left", label: "Align Left", kind: "align-left" as const, rank: 3 },
              {
                id: "align-center",
                label: "Align Center",
                kind: "align-center" as const,
                rank: 4,
              },
              { id: "align-right", label: "Align Right", kind: "align-right" as const, rank: 5 },
              { id: "align-top", label: "Align Top", kind: "align-top" as const, rank: 6 },
              {
                id: "align-middle",
                label: "Align Middle",
                kind: "align-middle" as const,
                rank: 7,
              },
              {
                id: "align-bottom",
                label: "Align Bottom",
                kind: "align-bottom" as const,
                rank: 8,
              },
              {
                id: "distribute-horizontal",
                label: "Distribute Horizontal",
                kind: "distribute-horizontal" as const,
                rank: 9,
              },
              {
                id: "distribute-vertical",
                label: "Distribute Vertical",
                kind: "distribute-vertical" as const,
                rank: 10,
              },
              {
                id: "match-width",
                label: "Match Width",
                kind: "match-width" as const,
                rank: 11,
              },
              {
                id: "match-height",
                label: "Match Height",
                kind: "match-height" as const,
                rank: 12,
              },
            ]
        : []),
      ...(selectedContainer
        ? [
              {
                id: "layout-free",
                label: currentLayoutMode === "free" ? "Layout: Free ✓" : "Layout: Free",
                kind: "layout-free" as const,
                rank: 13,
              },
              {
                id: "layout-row",
                label: currentLayoutMode === "row" ? "Layout: Row ✓" : "Layout: Row",
                kind: "layout-row" as const,
                rank: 14,
              },
              {
                id: "layout-column",
                label: currentLayoutMode === "column" ? "Layout: Column ✓" : "Layout: Column",
                kind: "layout-column" as const,
                rank: 15,
              },
              {
                id: "layout-grid",
                label: currentLayoutMode === "grid" ? "Layout: Grid ✓" : "Layout: Grid",
                kind: "layout-grid" as const,
                rank: 16,
              },
              {
                id: selectedContainer.collapsed
                  ? "expand-container"
                  : "collapse-container",
                label: selectedContainer.collapsed
                  ? "Expand Container"
                  : "Collapse Container",
                kind: selectedContainer.collapsed
                  ? ("expand-container" as const)
                  : ("collapse-container" as const),
                rank: 17,
              },
            ]
        : []),
      ...layers
        .map((layer, index) => ({ layer, index }))
        .filter(
          ({ index }) =>
            selectedElements.length > 0 &&
            index !== primaryLayerIndex &&
            selectedElements.every((element) => !isElementInteractionLocked(element)),
        )
        .map(({ layer, index }) => ({
          id: `send-to-layer-${layer.id}`,
          label: `Send to Layer: ${layer.name}`,
          kind: "send-to-layer" as const,
          layerId: layer.id,
          rank: 17 + index,
        })),
      ...(canGroup
        ? [{ id: "group", label: "Group", kind: "group" as const, rank: 40 }]
        : []),
      ...(canUngroup
        ? [
            {
                id: "ungroup",
                label: "Ungroup",
                kind: "ungroup" as const,
                rank: 41,
              },
            ]
        : []),
      ...(hasUnlockedSelection
        ? [{ id: "lock", label: "Lock", kind: "lock" as const, rank: 42 }]
        : []),
      ...(hasLockedSelection
        ? [{ id: "unlock", label: "Unlock", kind: "unlock" as const, rank: 43 }]
        : []),
      { id: "delete", label: "Delete", kind: "delete", rank: 44 },
    ];

    setSelectedActions(nextActions);
  }, [elements, isElementInteractionLocked, isFormatPainterActive, layers, selection]);

  const applyElementsWithInvariants = useCallback(
    (updater: (current: DiagramElement[]) => DiagramElement[]) => {
    setElements((current) => {
      const updated = updater(current);
      const reconciled = reconcileContainerOwnership(updated);
      const layered = inheritLayerFromParents(reconciled);
      const resized = autoSizeContainers(layered);
      const repaired = enforceConnectorInvariants(resized);
      const nextElements = repaired.repairedElements;
      const ops = createOpsFromElementDiff(current, nextElements);

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

  const findContainerDropTarget = useCallback(
    (movingElement: DiagramElement, current: DiagramElement[]): string | null => {
      if (
        movingElement.kind === "container" ||
        movingElement.kind === "line" ||
        movingElement.kind === "ink"
      ) {
        return null;
      }
      const sortedContainers = current
        .filter(
          (element) =>
            element.kind === "container" &&
            element.id !== movingElement.id &&
            !isElementInteractionLocked(element),
        )
        .sort((a, b) => a.width * a.height - b.width * b.height);
      const target = sortedContainers.find(
        (container) =>
          movingElement.x >= container.x &&
          movingElement.y >= container.y &&
          movingElement.x + movingElement.width <= container.x + container.width &&
          movingElement.y + movingElement.height <= container.y + container.height,
      );
      return target?.id ?? null;
    },
    [isElementInteractionLocked],
  );

  const alignSelection = useCallback(
    (targets: DiagramElement[], mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      if (targets.length < 2) {
        return;
      }
      const ids = new Set(targets.map((element) => element.id));
      const minX = Math.min(...targets.map((element) => element.x));
      const maxX = Math.max(...targets.map((element) => element.x + element.width));
      const minY = Math.min(...targets.map((element) => element.y));
      const maxY = Math.max(...targets.map((element) => element.y + element.height));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      applyElementsWithInvariants((current) =>
        current.map((element) => {
          if (!ids.has(element.id)) {
            return element;
          }
          if (mode === "left") {
            return { ...element, x: minX };
          }
          if (mode === "center") {
            return { ...element, x: centerX - element.width / 2 };
          }
          if (mode === "right") {
            return { ...element, x: maxX - element.width };
          }
          if (mode === "top") {
            return { ...element, y: minY };
          }
          if (mode === "middle") {
            return { ...element, y: centerY - element.height / 2 };
          }
          return { ...element, y: maxY - element.height };
        }),
      );
    },
    [applyElementsWithInvariants],
  );

  const distributeSelection = useCallback(
    (targets: DiagramElement[], axis: "horizontal" | "vertical") => {
      if (targets.length < 3) {
        return;
      }
      const sorted = [...targets].sort((a, b) =>
        axis === "horizontal"
          ? getElementCenter(a).x - getElementCenter(b).x
          : getElementCenter(a).y - getElementCenter(b).y,
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!first || !last) {
        return;
      }
      const firstCenter = getElementCenter(first);
      const lastCenter = getElementCenter(last);
      const span =
        axis === "horizontal"
          ? lastCenter.x - firstCenter.x
          : lastCenter.y - firstCenter.y;
      if (!Number.isFinite(span) || span === 0) {
        return;
      }
      const step = span / (sorted.length - 1);
      const byId = new Map(
        sorted.map((element, index) => [element.id, firstCenter[axis === "horizontal" ? "x" : "y"] + step * index]),
      );

      applyElementsWithInvariants((current) =>
        current.map((element) => {
          const targetCenter = byId.get(element.id);
          if (targetCenter === undefined) {
            return element;
          }
          if (axis === "horizontal") {
            return {
              ...element,
              x: targetCenter - element.width / 2,
            };
          }
          return {
            ...element,
            y: targetCenter - element.height / 2,
          };
        }),
      );
    },
    [applyElementsWithInvariants],
  );

  const matchSelectionSize = useCallback(
    (targets: DiagramElement[], axis: "width" | "height") => {
      if (targets.length < 2) {
        return;
      }
      const primary = targets.find((element) => element.id === selectedId) ?? targets[0];
      if (!primary) {
        return;
      }
      const nextSize = axis === "width" ? primary.width : primary.height;
      const ids = new Set(targets.map((element) => element.id));
      applyElementsWithInvariants((current) =>
        current.map((element) => {
          if (!ids.has(element.id)) {
            return element;
          }
          return axis === "width"
            ? { ...element, width: nextSize }
            : { ...element, height: nextSize };
        }),
      );
    },
    [applyElementsWithInvariants, selectedId],
  );

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
      const layered = inheritLayerFromParents(reconciled);
      const resized = autoSizeContainers(layered);
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
      const layered = inheritLayerFromParents(reconciled);
      const resized = autoSizeContainers(layered);
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

    const expandedSelectionIds = new Set(
      getGroupedSelectionIds(elements, selection.ids),
    );
    const selectedElements = elements.filter((element) =>
      expandedSelectionIds.has(element.id),
    );
    const unlockedSelectedElements = selectedElements.filter(
      (element) => !isElementInteractionLocked(element),
    );

    if (action.kind === "duplicate") {
      duplicateSelection();
      return;
    }

    if (action.kind === "copy-style") {
      const source = unlockedSelectedElements[0];
      if (!source || source.kind === "ink") {
        return;
      }
      setCopiedStyle({
        color: source.color,
        styleVariant: source.styleVariant,
      });
      setIsFormatPainterActive(true);
      return;
    }

    if (action.kind === "align-left") {
      alignSelection(unlockedSelectedElements, "left");
      return;
    }

    if (action.kind === "align-center") {
      alignSelection(unlockedSelectedElements, "center");
      return;
    }

    if (action.kind === "align-right") {
      alignSelection(unlockedSelectedElements, "right");
      return;
    }

    if (action.kind === "align-top") {
      alignSelection(unlockedSelectedElements, "top");
      return;
    }

    if (action.kind === "align-middle") {
      alignSelection(unlockedSelectedElements, "middle");
      return;
    }

    if (action.kind === "align-bottom") {
      alignSelection(unlockedSelectedElements, "bottom");
      return;
    }

    if (action.kind === "distribute-horizontal") {
      distributeSelection(unlockedSelectedElements, "horizontal");
      return;
    }

    if (action.kind === "distribute-vertical") {
      distributeSelection(unlockedSelectedElements, "vertical");
      return;
    }

    if (action.kind === "match-width") {
      matchSelectionSize(unlockedSelectedElements, "width");
      return;
    }

    if (action.kind === "match-height") {
      matchSelectionSize(unlockedSelectedElements, "height");
      return;
    }

    if (
      action.kind === "layout-free" ||
      action.kind === "layout-row" ||
      action.kind === "layout-column" ||
      action.kind === "layout-grid"
    ) {
      const layoutMode =
        action.kind === "layout-row"
          ? "row"
          : action.kind === "layout-column"
            ? "column"
            : action.kind === "layout-grid"
              ? "grid"
              : "free";
      const target = unlockedSelectedElements[0];
      if (!target || target.kind !== "container") {
        return;
      }
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === target.id
            ? {
                ...element,
                containerLayoutMode: layoutMode,
              }
            : element,
        ),
      );
      return;
    }

    if (action.kind === "collapse-container" || action.kind === "expand-container") {
      const target = unlockedSelectedElements[0];
      if (!target || target.kind !== "container") {
        return;
      }
      const collapsed = action.kind === "collapse-container";
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === target.id
            ? {
                ...element,
                collapsed,
              }
            : element,
        ),
      );
      setSelection(makeSelection([target.id]));
      return;
    }

    if (action.kind === "send-to-layer" && action.layerId) {
      const layerIndex = layerIndexById.get(action.layerId);
      if (layerIndex === undefined) {
        return;
      }
      const targetIds = new Set(getGroupedSelectionIds(elements, selection.ids));
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          targetIds.has(element.id)
            ? {
                ...element,
                layer: layerIndex,
              }
            : element,
        ),
      );
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

  const handleContainerCollapseToggle = useCallback(
    (containerId: string, collapsed: boolean) => {
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === containerId && element.kind === "container"
            ? {
                ...element,
                collapsed,
              }
            : element,
        ),
      );
      setSelection(makeSelection([containerId]));
    },
    [applyElementsWithInvariants],
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

  const handleSelectTextAlignHorizontal = useCallback(
    (textAlignHorizontal: TextAlignHorizontal) => {
      if (readOnly || !selectedElement || !supportsInlineTextEditing(selectedElement)) {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        textAlignHorizontal,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const handleSelectTextAlignVertical = useCallback(
    (textAlignVertical: TextAlignVertical) => {
      if (readOnly || !selectedElement || !supportsInlineTextEditing(selectedElement)) {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        textAlignVertical,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const handleSelectTextOverflowMode = useCallback(
    (textOverflowMode: TextOverflowMode) => {
      if (readOnly || !selectedElement || !supportsInlineTextEditing(selectedElement)) {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        textOverflowMode,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const handleSelectConnectorRouting = useCallback(
    (connectorRouting: ConnectorRouting) => {
      if (readOnly || !selectedElement || selectedElement.kind !== "line") {
        return;
      }
      updateSelectedElement((element) =>
        element.kind === "line"
          ? {
              ...element,
              connectorRouting,
            }
          : element,
      );
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const handleSelectStyleToken = useCallback(
    (styleTokenId?: string) => {
      if (readOnly || !selectedElement || selectedElement.kind === "ink") {
        return;
      }
      updateSelectedElement((element) => ({
        ...element,
        styleTokenId,
      }));
    },
    [readOnly, selectedElement, updateSelectedElement],
  );

  const selectedStyleVariant: PaletteStyleVariant | null = selectedElement
    ? selectedElement.styleVariant ?? getDefaultStyleVariant(selectedElement.kind)
    : null;
  const selectedTextAlignHorizontal: TextAlignHorizontal | undefined = selectedElement
    ? selectedElement.textAlignHorizontal ?? "center"
    : undefined;
  const selectedTextAlignVertical: TextAlignVertical | undefined = selectedElement
    ? selectedElement.textAlignVertical ?? "middle"
    : undefined;
  const selectedTextOverflowMode: TextOverflowMode | undefined = selectedElement
    ? resolveTextOverflowMode(selectedElement)
    : undefined;
  const selectedConnectorRouting: ConnectorRouting | undefined =
    selectedElement?.kind === "line"
      ? resolveConnectorRouting(selectedElement)
      : undefined;
  const selectedStyleTokenId: string | undefined =
    selectedElement?.kind === "ink" ? undefined : selectedElement?.styleTokenId;

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
    const incomingStyleTokens =
      document.settings?.styleTokens?.map((token) => ({ ...token })) ?? [];
    setElements([...document.elements]);
    setDocumentSettings({
      title: document.settings?.title ?? defaultDocumentTitle,
      background: document.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: document.settings?.canvas?.width,
        height: document.settings?.canvas?.height,
      },
      layers: incomingLayers,
      styleTokens: incomingStyleTokens,
    });
    setActiveLayerId(incomingLayers[0]?.id ?? "");
    setSelection(makeSelection(initialSelectionIds ?? []));
    resetHistory(document.elements);
  }, [document, initialSelectionIds, resetHistory]);

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
    const loadedStyleTokens =
      loaded.settings?.styleTokens?.map((token) => ({ ...token })) ?? [];
    setElements(repaired.repairedElements);
    setDocumentSettings({
      title: loaded.settings?.title ?? defaultDocumentTitle,
      background: loaded.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: loaded.settings?.canvas?.width,
        height: loaded.settings?.canvas?.height,
      },
      layers: loadedLayers,
      styleTokens: loadedStyleTokens,
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

  const handleExportDrawIo = () => {
    try {
      const xml = exportDrawIo(buildDocument());
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = createDownloadFilename().replace(/\.yaml$/, ".drawio");
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPersistenceError(null);
      setPersistenceMessage("Exported draw.io file.");
    } catch (error) {
      setPersistenceMessage(null);
      setPersistenceError(
        `draw.io export failed: ${
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
        assertNoCircularParentReferences(imported.document.elements);
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
        assertNoCircularParentReferences(imported.document.elements);
        applyDocument(imported.document);
        setPersistenceError(null);
        setPersistenceMessage("Imported Mermaid file.");
        return;
      }

      const imported = await importDocumentFromFile(file);
      assertNoCircularParentReferences(imported.elements);
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
    setContainerDropTargetId(null);

    const world = screenToWorld(local);
    const targetElementId =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-element-id]")?.dataset.elementId
        : undefined;
    const directTarget =
      targetElementId !== undefined
        ? elements.find((element) => element.id === targetElementId) ?? null
        : null;
    const hitElement = hitTestElement(world) ?? directTarget;

    if (
      directTarget &&
      isFormatPainterActive &&
      copiedStyle &&
      directTarget.kind !== "ink" &&
      !isElementInteractionLocked(directTarget)
    ) {
      applyElementsWithInvariants((current) =>
        current.map((element) =>
          element.id === directTarget.id
            ? {
                ...element,
                color: copiedStyle.color,
                styleVariant: copiedStyle.styleVariant,
              }
            : element,
        ),
      );
      setSelection(makeSelection([directTarget.id]));
      setIsFormatPainterActive(false);
      setStroke([]);
      setStrokeGhost(null);
      setDragMode(null);
      setSnapGuide(null);
      return;
    }

    if (hitElement) {
      if (
        isFormatPainterActive &&
        copiedStyle &&
        hitElement.kind !== "ink" &&
        !isElementInteractionLocked(hitElement)
      ) {
        applyElementsWithInvariants((current) =>
          current.map((element) =>
            element.id === hitElement.id
              ? {
                  ...element,
                  color: copiedStyle.color,
                  styleVariant: copiedStyle.styleVariant,
                }
              : element,
          ),
        );
        setSelection(makeSelection([hitElement.id]));
        setIsFormatPainterActive(false);
        setStroke([]);
        setStrokeGhost(null);
        setDragMode(null);
        setSnapGuide(null);
        return;
      }

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
      if (supportsInlineTextEditing(hitElement)) {
        const nextAlignment = resolveTextAlignmentFromClick(hitElement, world);
        applyElementsWithInvariants((current) =>
          current.map((element) =>
            element.id === hitElement.id
              ? {
                  ...element,
                  textAlignHorizontal: nextAlignment.horizontal,
                  textAlignVertical: nextAlignment.vertical,
                }
              : element,
          ),
        );
      }
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
      const primaryForDrop = elements.find((element) => element.id === selectedId);
      if (primaryForDrop) {
        const previewPrimary = {
          ...primaryForDrop,
          x: snappedPosition?.x ?? primaryForDrop.x + dx,
          y: snappedPosition?.y ?? primaryForDrop.y + dy,
        };
        setContainerDropTargetId(findContainerDropTarget(previewPrimary, elements));
      } else {
        setContainerDropTargetId(null);
      }
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
      let target = targetId
        ? elements.find((element) => element.id === targetId)
        : null;
      if (!target && source) {
        const pointer = dropWorld ?? connectionDrag.current;
        const candidates = elements.filter(
          (element) =>
            element.id !== source.id &&
            isConnectableElement(element),
        );
        if (candidates.length === 1) {
          target = candidates[0] ?? null;
        }
        const nearbyCandidate = candidates
          .reduce<{ element: DiagramElement; distance: number } | null>(
            (closest, candidate) => {
              const center = getElementCenter(candidate);
              const distance = Math.hypot(center.x - pointer.x, center.y - pointer.y);
              if (!closest || distance < closest.distance) {
                return { element: candidate, distance };
              }
              return closest;
            },
            null,
          );
        if (!target && nearbyCandidate && nearbyCandidate.distance <= 500) {
          target = nearbyCandidate.element;
        }
      }

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
      } else if (
        source &&
        source.kind !== "line" &&
        source.kind !== "ink"
      ) {
        const pointer = dropWorld ?? connectionDrag.current;
        const placeholder = assignLayerToElement(
          createRectangle(
            snapToGrid(pointer.x - 72),
            snapToGrid(pointer.y - 44),
            144,
            88,
          ),
        );
        const fromCenter = getElementCenter(source);
        const toCenter = getElementCenter(placeholder);
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
          placeholder,
          {
            ...nextConnector,
            connector: {
              fromId: source.id,
              toId: placeholder.id,
            },
          },
        ]);
        setSelection(makeSelection([placeholder.id]));
        setPersistenceMessage(
          "Target placeholder created. Use shape options to choose target type.",
        );
      }

      setConnectionDrag(null);
      setHoveredElementId(null);
      setDragMode(null);
      setSnapGuide(null);
      setContainerDropTargetId(null);
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
      setContainerDropTargetId(null);
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
      setContainerDropTargetId(null);
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
    setContainerDropTargetId(null);
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
    const nextText = textDraft.trim();
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === editingTextElementId && supportsInlineTextEditing(element)
          ? (() => {
              const textOverflowMode = resolveTextOverflowMode(element);
              const nextHeight =
                textOverflowMode === "grow-shape" && nextText.length > 0
                  ? Math.max(
                      element.height,
                      getAutoGrowHeightForText(nextText, element.width),
                    )
                  : element.height;
              return {
                ...element,
                text: nextText,
                height: nextHeight,
              };
            })()
          : element,
      ),
    );
    setEditingTextElementId(null);
  }, [applyElementsWithInvariants, editingTextElementId, textDraft]);

  const applyTextPatch = useCallback((patch: TextSelectionPatch) => {
    setTextDraft(patch.value);
    requestAnimationFrame(() => {
      textEditorRef.current?.focus();
      textEditorRef.current?.setSelectionRange(
        patch.selectionStart,
        patch.selectionEnd,
      );
    });
  }, []);

  const handleTextEditorShortcut = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const target = event.currentTarget;
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      const key = event.key.toLowerCase();

      if (key === "b") {
        event.preventDefault();
        applyTextPatch(
          toggleTextWrap(textDraft, selectionStart, selectionEnd, "**"),
        );
        return;
      }

      if (key === "i") {
        event.preventDefault();
        applyTextPatch(toggleTextWrap(textDraft, selectionStart, selectionEnd, "*"));
        return;
      }

      if (key === "k") {
        event.preventDefault();
        const href = window.prompt("Enter link URL", "https://");
        if (!href) {
          return;
        }
        const trimmedHref = href.trim();
        if (!trimmedHref) {
          return;
        }
        applyTextPatch(
          applyLinkToSelection(textDraft, selectionStart, selectionEnd, trimmedHref),
        );
      }
    },
    [applyTextPatch, textDraft],
  );

  const renderRichText = useCallback((value: string): ReactNode => {
    return parseRichTextSegments(value).map((segment, index) => {
      const key = `${segment.kind}-${index}`;
      if (segment.kind === "bold") {
        return <strong key={key}>{segment.value}</strong>;
      }
      if (segment.kind === "italic") {
        return <em key={key}>{segment.value}</em>;
      }
      if (segment.kind === "link") {
        return (
          <a
            key={key}
            href={segment.href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
          >
            {segment.value}
          </a>
        );
      }
      return <span key={key}>{segment.value}</span>;
    });
  }, []);

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

  const createKeyboardShape = useCallback(
    (kind: "rect" | "text") => {
      const centerWorld: Point = {
        x: (surfaceSize.width / 2 - view.x) / view.scale,
        y: (surfaceSize.height / 2 - view.y) / view.scale,
      };
      const baseElement =
        kind === "text"
          ? createText(centerWorld.x - 80, centerWorld.y - 28, 160, 56)
          : createRectangle(centerWorld.x - 80, centerWorld.y - 48, 160, 96);
      const nextElement = assignLayerToElement({
        ...baseElement,
        x: snapToGrid(baseElement.x),
        y: snapToGrid(baseElement.y),
      });
      applyElementsWithInvariants((current) => [...current, nextElement]);
      setSelection(makeSelection([nextElement.id]));
      setKeyboardConnectSourceId(null);
      setPersistenceMessage(
        kind === "text"
          ? "Created text shape with keyboard."
          : "Created rectangle with keyboard.",
      );
      if (supportsInlineTextEditing(nextElement)) {
        startInlineTextEdit(nextElement);
      }
    },
    [
      applyElementsWithInvariants,
      assignLayerToElement,
      setPersistenceMessage,
      startInlineTextEdit,
      surfaceSize.height,
      surfaceSize.width,
      view.scale,
      view.x,
      view.y,
    ],
  );

  const createKeyboardConnector = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        return false;
      }
      const source = elements.find((element) => element.id === sourceId);
      const target = elements.find((element) => element.id === targetId);
      if (!source || !target || !isConnectableElement(source) || !isConnectableElement(target)) {
        return false;
      }
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
      setPersistenceMessage("Created connector with keyboard.");
      return true;
    },
    [applyElementsWithInvariants, assignLayerToElement, elements],
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

      if (key === "escape" && keyboardConnectSourceId) {
        event.preventDefault();
        setKeyboardConnectSourceId(null);
        setPersistenceMessage("Cancelled keyboard connector mode.");
        return;
      }

      if (key === "n" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        createKeyboardShape("rect");
        return;
      }

      if (key === "t" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        createKeyboardShape("text");
        return;
      }

      if (
        key === "enter" &&
        !event.ctrlKey &&
        !event.metaKey &&
        selection.ids.length === 1
      ) {
        const selected = elements.find((element) => element.id === selection.ids[0]);
        if (selected && supportsInlineTextEditing(selected)) {
          event.preventDefault();
          startInlineTextEdit(selected);
          return;
        }
      }

      if (key === "k" && !event.ctrlKey && !event.metaKey && selection.ids.length === 1) {
        const selected = elements.find((element) => element.id === selection.ids[0]);
        if (selected && isConnectableElement(selected)) {
          event.preventDefault();
          if (!keyboardConnectSourceId) {
            setKeyboardConnectSourceId(selected.id);
            setPersistenceMessage("Connector source selected. Tab to target, then press K.");
            return;
          }
          if (keyboardConnectSourceId === selected.id) {
            setPersistenceMessage("Select a different target shape to connect.");
            return;
          }
          const created = createKeyboardConnector(keyboardConnectSourceId, selected.id);
          setKeyboardConnectSourceId(null);
          if (!created) {
            setPersistenceMessage("Could not create keyboard connector.");
          }
          return;
        }
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
    createKeyboardConnector,
    createKeyboardShape,
    copySelection,
    cutSelection,
    cycleSelection,
    duplicateSelection,
    elements,
    keyboardConnectSourceId,
    nudgeSelection,
    pasteClipboard,
    performRedo,
    performUndo,
    readOnly,
    selection.ids,
    startInlineTextEdit,
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

  useEffect(() => {
    if (!keyboardConnectSourceId) {
      return;
    }
    if (!elements.some((element) => element.id === keyboardConnectSourceId)) {
      setKeyboardConnectSourceId(null);
    }
  }, [elements, keyboardConnectSourceId]);

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

  const handleCreateStyleToken = () => {
    setDocumentSettings((current) => {
      const nextTokens = [...(current.styleTokens ?? [])];
      nextTokens.push(createDefaultStyleToken(nextTokens.length + 1));
      return {
        ...current,
        styleTokens: nextTokens,
      };
    });
  };

  const handleStyleTokenChange = (
    tokenId: string,
    patch: Partial<DiagramStyleToken>,
  ) => {
    setDocumentSettings((current) => ({
      ...current,
      styleTokens: (current.styleTokens ?? []).map((token) =>
        token.id === tokenId ? { ...token, ...patch } : token,
      ),
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

  const getLayerOpacity = useCallback(
    (layerId: string): number => {
      if (!soloLayerId) {
        return 1;
      }
      return soloLayerId === layerId ? 1 : 0.2;
    },
    [soloLayerId],
  );

  const handleToggleLayerVisibility = (
    layerId: string,
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (soloLayerId) {
      setSoloLayerId(null);
      return;
    }
    if (event?.altKey) {
      setSoloLayerId(layerId);
      return;
    }
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

  const handleToggleElementVisibility = (elementId: string) => {
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === elementId
          ? {
              ...element,
              hidden: !element.hidden,
            }
          : element,
      ),
    );
    setSelection((current) =>
      current.ids.includes(elementId) ? makeSelection() : current,
    );
  };

  const handleToggleElementLock = (elementId: string) => {
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === elementId
          ? {
              ...element,
              locked: !element.locked,
            }
          : element,
      ),
    );
  };

  const reorderElementsInOutline = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }
    applyElementsWithInvariants((current) => {
      const reordered = [...current];
      const fromIndex = reordered.findIndex((element) => element.id === fromId);
      const toIndex = reordered.findIndex((element) => element.id === toId);
      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) {
        return current;
      }
      reordered.splice(toIndex, 0, moved);
      return reordered;
    });
  };

  const moveElementToLayer = (elementId: string, layerIndex: number) => {
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === elementId
          ? {
              ...element,
              layer: layerIndex,
              groupId: undefined,
              parentId: undefined,
            }
          : element,
      ),
    );
  };

  const assignElementToGroup = (elementId: string, groupId?: string) => {
    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === elementId
          ? {
              ...element,
              groupId,
              parentId: undefined,
            }
          : element,
      ),
    );
  };

  const assignElementParent = (elementId: string, parentId?: string) => {
    applyElementsWithInvariants((current) => {
      const parent = parentId
        ? current.find((element) => element.id === parentId && element.kind === "container")
        : null;
      return current.map((element) => {
        if (element.id !== elementId) {
          return element;
        }
        if (!parent) {
          return {
            ...element,
            parentId,
          };
        }
        const nextX = parent.x + CONTAINER_PADDING;
        const nextY = parent.y + CONTAINER_PADDING;
        return {
          ...element,
          parentId,
          x: nextX,
          y: nextY,
        };
      });
    });
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

  const toggleOutlineLayerCollapse = (layerId: string) => {
    setCollapsedOutlineLayers((current) =>
      current.includes(layerId)
        ? current.filter((id) => id !== layerId)
        : [...current, layerId],
    );
  };

  const toggleOutlineGroupCollapse = (groupId: string) => {
    setCollapsedOutlineGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  };

  const outlineFilterText = outlineFilter.trim().toLowerCase();
  const filteredOutlineElements = useMemo(() => {
    if (!outlineFilterText) {
      return elements;
    }
    return elements.filter((element) => {
      const layerName = layers[element.layer ?? 0]?.name ?? "";
      const text = element.text ?? "";
      const kind = element.kind;
      const group = element.groupId ?? "";
      return [element.id, text, kind, group, layerName]
        .join(" ")
        .toLowerCase()
        .includes(outlineFilterText);
    });
  }, [elements, layers, outlineFilterText]);

  const outlineElementsByLayer = useMemo(() => {
    return layers.map((_, layerIndex) => {
      const layerElements = filteredOutlineElements.filter(
        (element) => (element.layer ?? 0) === layerIndex,
      );
      const grouped = new Map<string, DiagramElement[]>();
      const ungrouped: DiagramElement[] = [];

      layerElements.forEach((element) => {
        if (element.groupId) {
          const entries = grouped.get(element.groupId) ?? [];
          entries.push(element);
          grouped.set(element.groupId, entries);
          return;
        }
        ungrouped.push(element);
      });

      return {
        grouped,
        ungrouped,
      };
    });
  }, [filteredOutlineElements, layers]);

  const libraryFilterText = libraryFilter.trim().toLowerCase();
  const libraryShapesByCategory = useMemo(() => {
    return getBuiltInLibraryCategories().map((category) => {
      const shapes = builtInLibraryShapes.filter((shape) => {
        if (shape.category !== category) {
          return false;
        }
        if (!libraryFilterText) {
          return true;
        }
        return `${shape.id} ${shape.name}`.toLowerCase().includes(libraryFilterText);
      });
      return { category, shapes };
    });
  }, [libraryFilterText]);

  const handleApplyAutoLayout = (algorithm: AutoLayoutAlgorithm) => {
    applyElementsWithInvariants((current) =>
      applyAutoLayout(current, algorithm, selection.ids),
    );
    setIsLayoutDialogOpen(false);
  };

  const handleLibraryDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly) {
      return;
    }
    const shapeId =
      event.dataTransfer.getData("application/x-gd-library-shape") ||
      event.dataTransfer.getData("text/plain");
    if (!shapeId) {
      return;
    }
    const localPoint = {
      x:
        (Number.isFinite(event.clientX)
          ? event.clientX
          : event.currentTarget.getBoundingClientRect().left) -
        event.currentTarget.getBoundingClientRect().left,
      y:
        (Number.isFinite(event.clientY)
          ? event.clientY
          : event.currentTarget.getBoundingClientRect().top) -
        event.currentTarget.getBoundingClientRect().top,
    };
    const world = screenToWorld(localPoint);
    const shape = createShapeFromLibrary(shapeId, world.x, world.y);
    if (!shape) {
      return;
    }
    const prepared = assignLayerToElement(shape);
    applyElementsWithInvariants((current) => [...current, prepared]);
    setSelection(makeSelection([prepared.id]));
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
        <button type="button" onClick={performUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={performRedo} disabled={!canRedo}>
          Redo
        </button>
        <div className="toolbar-overflow">
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={isToolbarMenuOpen}
            onClick={() => setIsToolbarMenuOpen((current) => !current)}
          >
            …
          </button>
          {isToolbarMenuOpen && (
            <div className="toolbar-overflow-menu" role="menu" aria-label="Toolbar overflow">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handleFitToContent();
                  setIsToolbarMenuOpen(false);
                }}
              >
                Fit to Content
              </button>
              {!readOnly && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsLayoutDialogOpen(true);
                    setIsToolbarMenuOpen(false);
                  }}
                >
                  Layout
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleOpenOnboarding();
                    setIsToolbarMenuOpen(false);
                  }}
                >
                  Cheat Sheet
                </button>
              )}
            </div>
          )}
        </div>
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
      {!readOnly && isLayoutDialogOpen && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Layout dialog">
          <div className="onboarding-panel">
            <h2>Apply Layout</h2>
            <p>Choose an algorithm for whole diagram or current selection.</p>
            <div className="onboarding-actions">
              <button type="button" onClick={() => handleApplyAutoLayout("layered")}>
                Layered
              </button>
              <button type="button" onClick={() => handleApplyAutoLayout("tree")}>
                Tree
              </button>
              <button type="button" onClick={() => handleApplyAutoLayout("radial")}>
                Radial
              </button>
              <button type="button" onClick={() => handleApplyAutoLayout("grid")}>
                Grid
              </button>
              <button type="button" onClick={() => setIsLayoutDialogOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="editor-workbench">
      {!readOnly && (
        <aside className="editor-sidebar editor-sidebar-right" aria-label="Properties panel">
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
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Style tokens</span>
                <button type="button" onClick={handleCreateStyleToken}>
                  Add token
                </button>
              </div>
              {(documentSettings.styleTokens ?? []).map((token) => (
                <div
                  key={token.id}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6 }}
                >
                  <input
                    aria-label={`Style token name ${token.name}`}
                    value={token.name}
                    onChange={(event) =>
                      handleStyleTokenChange(token.id, {
                        name: event.target.value.trim().length > 0 ? event.target.value : token.name,
                      })
                    }
                  />
                  <input
                    aria-label={`Style token color ${token.name}`}
                    type="color"
                    value={token.color ?? "#4f46e5"}
                    onChange={(event) =>
                      handleStyleTokenChange(token.id, { color: event.target.value })
                    }
                  />
                  <input
                    aria-label={`Style token font size ${token.name}`}
                    type="number"
                    min={8}
                    value={token.fontSize ?? 14}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10);
                      handleStyleTokenChange(token.id, {
                        fontSize: Number.isFinite(nextValue) ? nextValue : token.fontSize,
                      });
                    }}
                  />
                  <input
                    aria-label={`Style token stroke width ${token.name}`}
                    type="number"
                    min={1}
                    value={token.strokeWidth ?? 2}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10);
                      handleStyleTokenChange(token.id, {
                        strokeWidth: Number.isFinite(nextValue) ? nextValue : token.strokeWidth,
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </aside>
      )}

      {!readOnly && (
        <aside className="editor-sidebar editor-sidebar-left" aria-label="Left sidebar">
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
                  className={soloLayerId === layer.id ? "layer-row solo-layer" : "layer-row"}
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
                    onClick={(event) => handleToggleLayerVisibility(layer.id, event)}
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

        <fieldset className="layer-panel" aria-label="Outline panel">
          <legend>Outline</legend>
          <div className="layer-panel-actions">
            <input
              type="search"
              aria-label="Outline filter"
              placeholder="Filter layers, groups, shapes"
              value={outlineFilter}
              onChange={(event) => setOutlineFilter(event.target.value)}
            />
          </div>
          <ul className="layer-list">
            {layers.map((layer, index) => {
              const outlineLayer = outlineElementsByLayer[index];
              if (!outlineLayer) {
                return null;
              }
              const isCollapsed = collapsedOutlineLayers.includes(layer.id);
              return (
                <li key={`outline-${layer.id}`} className="layer-row">
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const draggedId = draggedOutlineElementIdRef.current;
                      if (!draggedId) {
                        return;
                      }
                      moveElementToLayer(draggedId, index);
                      draggedOutlineElementIdRef.current = null;
                    }}
                  >
                    <button
                      type="button"
                      aria-label={isCollapsed ? `Expand ${layer.name}` : `Collapse ${layer.name}`}
                      onClick={() => toggleOutlineLayerCollapse(layer.id)}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Select ${layer.name} in outline`}
                      onClick={() => setActiveLayerId(layer.id)}
                    >
                      {layer.name}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <ul className="layer-list" style={{ marginLeft: 18, marginTop: 6 }}>
                      {[...outlineLayer.grouped.entries()].map(([groupId, groupElements]) => {
                        const groupCollapsed = collapsedOutlineGroups.includes(groupId);
                        return (
                          <li key={`outline-group-${groupId}`} className="layer-row">
                            <div
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const draggedId = draggedOutlineElementIdRef.current;
                                if (!draggedId) {
                                  return;
                                }
                                assignElementToGroup(draggedId, groupId);
                                draggedOutlineElementIdRef.current = null;
                              }}
                            >
                              <button
                                type="button"
                                aria-label={groupCollapsed ? `Expand group ${groupId}` : `Collapse group ${groupId}`}
                                onClick={() => toggleOutlineGroupCollapse(groupId)}
                              >
                                {groupCollapsed ? "▸" : "▾"}
                              </button>
                              <span>{`Group ${groupId.slice(0, 8)}`}</span>
                            </div>
                            {!groupCollapsed && (
                              <ul className="layer-list" style={{ marginLeft: 18, marginTop: 6 }}>
                                {groupElements.map((element) => (
                                  <li
                                    key={`outline-shape-${element.id}`}
                                    className="layer-row"
                                    draggable
                                    onDragStart={() => {
                                      draggedOutlineElementIdRef.current = element.id;
                                    }}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={() => {
                                      const draggedId = draggedOutlineElementIdRef.current;
                                      if (!draggedId) {
                                        return;
                                      }
                                      reorderElementsInOutline(draggedId, element.id);
                                      draggedOutlineElementIdRef.current = null;
                                    }}
                                  >
                                    <button
                                      type="button"
                                      aria-label={`Select ${element.id} in outline`}
                                      onClick={() => setSelection(makeSelection([element.id]))}
                                    >
                                      {`${element.kind}${element.text ? `: ${element.text}` : ""}`}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Toggle visibility for ${element.id}`}
                                      onClick={() => handleToggleElementVisibility(element.id)}
                                    >
                                      {element.hidden ? "Show" : "Hide"}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Toggle lock for ${element.id}`}
                                      onClick={() => handleToggleElementLock(element.id)}
                                    >
                                      {element.locked ? "Unlock" : "Lock"}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {outlineLayer.ungrouped.map((element) => (
                        <li
                          key={`outline-ungrouped-${element.id}`}
                          className="layer-row"
                          draggable
                          onDragStart={() => {
                            draggedOutlineElementIdRef.current = element.id;
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            const draggedId = draggedOutlineElementIdRef.current;
                            if (!draggedId) {
                              return;
                            }
                            reorderElementsInOutline(draggedId, element.id);
                            draggedOutlineElementIdRef.current = null;
                          }}
                        >
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
                            onDragOver={(event) => {
                              if (element.kind === "container") {
                                event.preventDefault();
                              }
                            }}
                            onDrop={() => {
                              const draggedId = draggedOutlineElementIdRef.current;
                              if (!draggedId || element.kind !== "container") {
                                return;
                              }
                              if (draggedId === element.id) {
                                return;
                              }
                              assignElementParent(draggedId, element.id);
                              draggedOutlineElementIdRef.current = null;
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Select ${element.id} in outline`}
                              onClick={() => setSelection(makeSelection([element.id]))}
                            >
                              {`${element.kind}${element.text ? `: ${element.text}` : ""}`}
                            </button>
                            <button
                              type="button"
                              aria-label={`Toggle visibility for ${element.id}`}
                              onClick={() => handleToggleElementVisibility(element.id)}
                            >
                              {element.hidden ? "Show" : "Hide"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Toggle lock for ${element.id}`}
                              onClick={() => handleToggleElementLock(element.id)}
                            >
                              {element.locked ? "Unlock" : "Lock"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="layer-panel" aria-label="Library panel">
          <legend>Library</legend>
          <div className="layer-panel-actions">
            <input
              type="search"
              aria-label="Library filter"
              placeholder="Filter shapes"
              value={libraryFilter}
              onChange={(event) => setLibraryFilter(event.target.value)}
            />
          </div>
          <ul className="layer-list">
            {libraryShapesByCategory.map((entry) => (
              <li key={`library-${entry.category}`} className="layer-row">
                <strong>{entry.category}</strong>
                <ul className="layer-list" style={{ marginLeft: 12, marginTop: 6 }}>
                  {entry.shapes.map((shape) => (
                    <li key={shape.id} className="layer-row">
                      <button
                        type="button"
                        draggable
                        aria-label={`Library shape ${shape.name}`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-gd-library-shape", shape.id);
                          event.dataTransfer.setData("text/plain", shape.id);
                        }}
                        onClick={() => {
                          const center = {
                            x: -view.x / view.scale + surfaceSize.width / (2 * view.scale),
                            y: -view.y / view.scale + surfaceSize.height / (2 * view.scale),
                          };
                          const created = createShapeFromLibrary(shape.id, center.x, center.y);
                          if (!created) {
                            return;
                          }
                          const prepared = assignLayerToElement(created);
                          applyElementsWithInvariants((current) => [...current, prepared]);
                          setSelection(makeSelection([prepared.id]));
                        }}
                      >
                        {shape.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </fieldset>
        </aside>
      )}

      <div className="editor-canvas-panel">
      {!readOnly && (
        <DocumentPersistenceControls
          onSave={handleSave}
          onLoad={handleLoad}
          onExportYaml={handleExport}
          onExportSvg={handleExportSvg}
          onExportPng={handleExportPng}
          onExportPdf={handleExportPdf}
          onExportDrawIo={handleExportDrawIo}
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
        aria-describedby="diagram-screen-reader-summary"
        role="region"
        aria-roledescription="Interactive diagram editor surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredElementId(null)}
        onWheel={handleWheel}
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes("application/x-gd-library-shape") ||
            event.dataTransfer.types.includes("text/plain")
          ) {
            event.preventDefault();
          }
        }}
        onDrop={handleLibraryDrop}
      >
        <div
          id="diagram-screen-reader-summary"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {screenReaderSummary}
        </div>
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
            selectedTextAlignHorizontal={
              shouldShowShapeCustomizer ? selectedTextAlignHorizontal : undefined
            }
            selectedTextAlignVertical={
              shouldShowShapeCustomizer ? selectedTextAlignVertical : undefined
            }
            onSelectTextAlignHorizontal={
              shouldShowShapeCustomizer ? handleSelectTextAlignHorizontal : undefined
            }
            onSelectTextAlignVertical={
              shouldShowShapeCustomizer ? handleSelectTextAlignVertical : undefined
            }
            selectedTextOverflowMode={
              shouldShowShapeCustomizer && selectedElement && supportsInlineTextEditing(selectedElement)
                ? selectedTextOverflowMode
                : undefined
            }
            onSelectTextOverflowMode={
              shouldShowShapeCustomizer && selectedElement && supportsInlineTextEditing(selectedElement)
                ? handleSelectTextOverflowMode
                : undefined
            }
            selectedConnectorRouting={
              shouldShowShapeCustomizer && selectedElement?.kind === "line"
                ? selectedConnectorRouting
                : undefined
            }
            onSelectConnectorRouting={
              shouldShowShapeCustomizer && selectedElement?.kind === "line"
                ? handleSelectConnectorRouting
                : undefined
            }
            styleTokens={shouldShowShapeCustomizer ? styleTokens : []}
            selectedStyleTokenId={
              shouldShowShapeCustomizer ? selectedStyleTokenId : undefined
            }
            onSelectStyleToken={
              shouldShowShapeCustomizer ? handleSelectStyleToken : undefined
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
            const styleToken = element.styleTokenId
              ? styleTokenById.get(element.styleTokenId)
              : undefined;
            const strokeWidth = element.strokeWidth ?? styleToken?.strokeWidth ?? 2;
            const baseColor =
              element.color ??
              styleToken?.color ??
              "var(--gd-element-stroke, #1f2937)";
            const baseTokenFontSize = styleToken?.fontSize ?? baseTextFontSize;
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
              opacity: getLayerOpacity(layerByIndex.get(element.layer ?? 0)?.id ?? ""),
            };

            if (element.kind === "line") {
              const connectorRouting = resolveConnectorRouting(element);
              const linePoints =
                element.points && element.points.length >= 2
                  ? element.points
                  : [
                      { x: element.x, y: element.y },
                      { x: element.x + element.width, y: element.y + element.height },
                    ];
              const localPoints = linePoints.map((point) => ({
                x: point.x - element.x,
                y: point.y - element.y,
              }));
              const polylinePoints = localPoints
                .map((point) => `${point.x},${point.y}`)
                .join(" ");
              const firstPoint = localPoints[0];
              const lastPoint = localPoints[localPoints.length - 1];
              const curvedPath =
                firstPoint && lastPoint
                  ? (() => {
                      const midX = (firstPoint.x + lastPoint.x) / 2;
                      const midY = (firstPoint.y + lastPoint.y) / 2;
                      const dx = lastPoint.x - firstPoint.x;
                      const dy = lastPoint.y - firstPoint.y;
                      const length = Math.max(1, Math.hypot(dx, dy));
                      const normalX = -dy / length;
                      const normalY = dx / length;
                      const offset = Math.min(48, Math.max(18, length * 0.15));
                      const controlX = midX + normalX * offset;
                      const controlY = midY + normalY * offset;
                      return `M ${firstPoint.x} ${firstPoint.y} Q ${controlX} ${controlY} ${lastPoint.x} ${lastPoint.y}`;
                    })()
                  : "";
              const lineStyle: CSSProperties = {
                ...style,
                background: "transparent",
                border: "0",
                borderRadius: 0,
                boxShadow: "none",
                overflow: "visible",
              };

              return (
                <div
                  key={element.id}
                  style={lineStyle}
                  aria-label={accessibleElementLabelById.get(element.id) ?? "Connector"}
                >
                  <svg
                    style={{
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                    }}
                    viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
                    preserveAspectRatio="none"
                  >
                    {connectorRouting === "curved" && curvedPath ? (
                      <path
                        d={curvedPath}
                        fill="none"
                        stroke={borderColor}
                        strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={isDashedStyle ? "8 5" : undefined}
                      />
                    ) : (
                      <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke={borderColor}
                        strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={isDashedStyle ? "8 5" : undefined}
                      />
                    )}
                  </svg>
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
                    opacity: getLayerOpacity(layerByIndex.get(element.layer ?? 0)?.id ?? ""),
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

            const textAlignHorizontal = element.textAlignHorizontal ?? "center";
            const textAlignVertical = element.textAlignVertical ?? "middle";
            const justifyContent =
              textAlignHorizontal === "left"
                ? "flex-start"
                : textAlignHorizontal === "right"
                  ? "flex-end"
                  : "center";
            const alignItems =
              textAlignVertical === "top"
                ? "flex-start"
                : textAlignVertical === "bottom"
                  ? "flex-end"
                  : "center";
            const textOverflowMode = resolveTextOverflowMode(element);
            const textSizing =
              textOverflowMode === "shrink-text" && element.text?.trim()
                ? resolveShrinkTextFontSize(
                    element.text,
                    element.width,
                    element.height,
                    baseTokenFontSize,
                  )
                : {
                    fontSize: baseTokenFontSize,
                    lineHeight: Math.max(12, Math.round(baseTokenFontSize * 1.3)),
                  };
            const centeredLabelStyle: CSSProperties = {
              position: "absolute",
              inset: 0,
              padding: "8px 10px",
              color: baseColor,
              fontSize: `${textSizing.fontSize}px`,
              lineHeight: `${textSizing.lineHeight}px`,
              textAlign: textAlignHorizontal,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "flex",
              alignItems,
              justifyContent,
              pointerEvents: "none",
              userSelect: "none",
              boxSizing: "border-box",
            };

            if (element.kind === "diamond") {
              return (
                <div
                  key={element.id}
                  aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                  data-element-id={element.id}
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
                    opacity: getLayerOpacity(layerByIndex.get(element.layer ?? 0)?.id ?? ""),
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
                    <div style={centeredLabelStyle}>{renderRichText(element.text)}</div>
                  ) : null}
                </div>
              );
            }

            if (element.kind === "triangle") {
              return (
                <div
                  key={element.id}
                  aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                  data-element-id={element.id}
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
                    opacity: getLayerOpacity(layerByIndex.get(element.layer ?? 0)?.id ?? ""),
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
                    <div style={centeredLabelStyle}>{renderRichText(element.text)}</div>
                  ) : null}
                </div>
              );
            }

            if (element.kind === "text") {
              return (
                <div
                  key={element.id}
                  aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                  data-element-id={element.id}
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
                      fontSize: `${textSizing.fontSize}px`,
                      lineHeight: `${textSizing.lineHeight}px`,
                      overflow: "hidden",
                      boxSizing: "border-box",
                      userSelect: "none",
                      whiteSpace: "pre-wrap",
                      textAlign: textAlignHorizontal,
                      wordBreak: "break-word",
                      display: "flex",
                      alignItems,
                      justifyContent,
                    }}
                  >
                    {element.text && element.text.length > 0
                      ? renderRichText(element.text)
                      : "Type text"}
                  </div>
                </div>
              );
            }

            if (element.kind === "container") {
              const isContainerDropTarget = containerDropTargetId === element.id;
              const isCollapsed = Boolean(element.collapsed);
              return (
                <div
                  key={element.id}
                  aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                  data-element-id={element.id}
                  data-drop-target={isContainerDropTarget ? "true" : undefined}
                  style={{
                    ...style,
                    borderColor,
                    background: isFilledStyle
                      ? "rgba(148, 163, 184, 0.08)"
                      : "transparent",
                    boxShadow: isContainerDropTarget
                      ? "0 0 0 2px var(--gd-color-selection-handle-border) inset"
                      : undefined,
                    overflow: "hidden",
                  }}
                  onDoubleClick={(event) => handleElementDoubleClick(element, event)}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: "100%",
                      height: `${COLLAPSED_CONTAINER_HEIGHT - 8}px`,
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--gd-color-divider, rgba(15, 23, 42, 0.16))",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(148, 163, 184, 0.12)",
                      boxSizing: "border-box",
                    }}
                  >
                    <button
                      type="button"
                      aria-label={isCollapsed ? "Expand container" : "Collapse container"}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleContainerCollapseToggle(element.id, !isCollapsed);
                      }}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: "1px solid var(--gd-color-selection-handle-border)",
                        background: "var(--gd-color-surface, #fff)",
                        color: "var(--gd-color-selection-handle-border)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                    <div
                      style={{
                        color: "var(--gd-color-text)",
                        fontSize: "13px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {element.text?.trim() || "Container"}
                    </div>
                  </div>
                </div>
              );
            }

            if (element.kind === "ellipse") {
              return (
                <div
                  key={element.id}
                  aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                  data-element-id={element.id}
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
                    <div style={centeredLabelStyle}>{renderRichText(element.text)}</div>
                  ) : null}
                </div>
              );
            }

            return (
              <div
                key={element.id}
                aria-label={accessibleElementLabelById.get(element.id) ?? `Shape ${element.kind}`}
                data-element-id={element.id}
                style={style}
                onDoubleClick={(event) => handleElementDoubleClick(element, event)}
              >
                {element.text?.trim() ? (
                  <div style={centeredLabelStyle}>{renderRichText(element.text)}</div>
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

          {visibleElements
            .filter(
              (element) =>
                isConnectableElement(element) &&
                (hiddenConnectionIndicatorByElementId.get(element.id) ?? 0) > 0,
            )
            .map((element) => {
              const hiddenConnectionCount =
                hiddenConnectionIndicatorByElementId.get(element.id) ?? 0;
              return (
                <div
                  key={`hidden-connection-${element.id}`}
                  aria-label={`${hiddenConnectionCount} hidden connection${hiddenConnectionCount === 1 ? "" : "s"}`}
                  title={`${hiddenConnectionCount} hidden connection${hiddenConnectionCount === 1 ? "" : "s"}`}
                  style={{
                    position: "absolute",
                    left: element.x + element.width - 18,
                    top: element.y + 8,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    border: "1px solid var(--gd-color-warning-border, #ea580c)",
                    background: "var(--gd-color-warning-bg, #ffedd5)",
                    color: "var(--gd-color-warning-text, #9a3412)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 5px",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    zIndex: 12,
                    pointerEvents: "none",
                  }}
                >
                  {hiddenConnectionCount}
                </div>
              );
            })}

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
                  ref={textEditorRef}
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
                      return;
                    }
                    handleTextEditorShortcut(event);
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
      </div>
    </div>
  );
}
