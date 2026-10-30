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
import { ContextPalette, type PaletteAction } from "./ContextPalette";
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
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from "../editor/document";
import {
  getGroupedSelectionIds,
  groupElements,
  moveGroupedElements,
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
import { createInk } from "../editor/shapes";
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

type DragMode = "draw" | "move" | "resize" | "marquee" | null;
type HistorySnapshot = DiagramElement[];
type MarqueeSelection = { start: Point; end: Point };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

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
    }),
    [document?.settings?.background, document?.settings?.canvas?.height, document?.settings?.canvas?.width, document?.settings?.title],
  );
  const [view, setView] = useState<ViewState>(createViewState());
  const [elements, setElements] = useState<DiagramElement[]>(
    document ? [...document.elements] : [],
  );
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
  const [documentSettings, setDocumentSettings] = useState(initialSettings);
  const [surfaceSize, setSurfaceSize] = useState({ width: 1024, height: 768 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelection | null>(null);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const [snapGuide, setSnapGuide] = useState<SnapGuide | null>(null);
  const [, setHistoryVersion] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerWorldRef = useRef<Point | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const applyingHistoryRef = useRef(false);
  const clipboardRef = useRef<DiagramElement[] | null>(null);
  const pasteSequenceRef = useRef(0);

  const cloneElements = useCallback((value: DiagramElement[]): DiagramElement[] => {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as DiagramElement[];
  }, []);

  const resetHistory = useCallback(
    (snapshot: DiagramElement[]) => {
      undoStackRef.current = [cloneElements(snapshot)];
      redoStackRef.current = [];
      setHistoryVersion((current) => current + 1);
    },
    [cloneElements],
  );

  const canUndo = undoStackRef.current.length > 1;
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

  const visibleElements = useMemo(
    () => getVisibleElements(elements, view, surfaceSize),
    [elements, surfaceSize, view],
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
    if (!hasSelection(selection)) {
      setSelectedActions([]);
      return;
    }

    const selectedElements = elements.filter((element) =>
      selection.ids.includes(element.id),
    );
    const canGroup = selection.ids.length > 1;
    const canUngroup = selectedElements.some((element) =>
      Boolean(element.groupId),
    );

    const nextActions: PaletteAction[] = [
      { id: "convert", label: "Convert", kind: "convert", rank: 1 },
      { id: "duplicate", label: "Duplicate", kind: "duplicate", rank: 2 },
      { id: "style", label: "Style", kind: "style", rank: 3 },
      ...(canGroup
        ? [{ id: "group", label: "Group", kind: "group" as const, rank: 4 }]
        : []),
      ...(canUngroup
        ? [
            {
              id: "ungroup",
              label: "Ungroup",
              kind: "ungroup" as const,
              rank: 5,
            },
          ]
        : []),
      { id: "delete", label: "Delete", kind: "delete", rank: 6 },
    ];

    setSelectedActions(nextActions);
  }, [elements, selection]);

  const applyElementsWithInvariants = useCallback(
    (updater: (current: DiagramElement[]) => DiagramElement[]) => {
    setElements((current) => {
      const updated = updater(current);
      const repaired = enforceConnectorInvariants(updated);
      const nextElements = repaired.repairedElements;

      if (!applyingHistoryRef.current) {
        const currentJson = JSON.stringify(current);
        const nextJson = JSON.stringify(nextElements);
        if (currentJson !== nextJson) {
          undoStackRef.current.push(cloneElements(nextElements));
          if (undoStackRef.current.length > 100) {
            undoStackRef.current.shift();
          }
          redoStackRef.current = [];
          setHistoryVersion((value) => value + 1);
        }
      }

      return nextElements;
    });
  }, [cloneElements]);

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

  const updateSelectedElement = (updater: (element: DiagramElement) => DiagramElement) => {
    if (!selectedId) {
      return;
    }

    applyElementsWithInvariants((current) =>
      current.map((element) =>
        element.id === selectedId ? updater(element) : element,
      ),
    );
  };

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

    const currentStack = undoStackRef.current;
    const current = currentStack[currentStack.length - 1];
    const previous = currentStack[currentStack.length - 2];
    if (!current || !previous) {
      return;
    }

    applyingHistoryRef.current = true;
    redoStackRef.current.push(cloneElements(current));
    undoStackRef.current.pop();
    setElements(cloneElements(previous));
    setSelection(makeSelection());
    applyingHistoryRef.current = false;
    setHistoryVersion((value) => value + 1);
  }, [canUndo, cloneElements]);

  const performRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    const next = redoStackRef.current.pop();
    if (!next) {
      return;
    }

    applyingHistoryRef.current = true;
    undoStackRef.current.push(cloneElements(next));
    setElements(cloneElements(next));
    setSelection(makeSelection());
    applyingHistoryRef.current = false;
    setHistoryVersion((value) => value + 1);
  }, [canRedo, cloneElements]);

  const handlePaletteAction = (action: PaletteAction) => {
    if (readOnly) {
      return;
    }

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
      duplicateSelection();
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
      applyElementsWithInvariants((current) =>
        current.filter((element) => !idsToDelete.has(element.id)),
      );
      setSelection(makeSelection());
    }
  };

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
    const incoming = JSON.stringify(document.elements);
    const current = JSON.stringify(elements);
    if (incoming === current) {
      return;
    }

    setElements([...document.elements]);
    setDocumentSettings({
      title: document.settings?.title ?? defaultDocumentTitle,
      background: document.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: document.settings?.canvas?.width,
        height: document.settings?.canvas?.height,
      },
    });
    setSelection(makeSelection());
    resetHistory(document.elements);
  }, [document, elements, resetHistory]);

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
    setElements(repaired.repairedElements);
    setDocumentSettings({
      title: loaded.settings?.title ?? defaultDocumentTitle,
      background: loaded.settings?.background ?? defaultCanvasBackground,
      canvas: {
        width: loaded.settings?.canvas?.width,
        height: loaded.settings?.canvas?.height,
      },
    });
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }

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
      if (event.metaKey || event.ctrlKey) {
        const nextIds = selection.ids.includes(hitElement.id)
          ? selection.ids.filter((id) => id !== hitElement.id)
          : [...selection.ids, hitElement.id];
        setSelection(makeSelection(nextIds));
        setDragMode(null);
        setSnapGuide(null);
        return;
      }

      const nextSelection = hitElement.groupId
        ? getGroupedSelectionIds(elements, [hitElement.id])
        : [hitElement.id];
      setSelection(makeSelection(nextSelection));
      setStroke([]);
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
      const snapDisabled = event.altKey;
      let snappedPosition: { x: number; y: number } | null = null;
      let guide: SnapGuide | null = null;

      if (!snapDisabled && selection.ids.length === 1) {
        const primary = elements.find((element) => element.id === selectedId);
        if (primary && primary.kind !== "line") {
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
          const moved = moveGroupedElements(current, selection.ids, dx, dy);
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

    if (
      dragMode === "resize" &&
      selectedId &&
      resizeHandle &&
      lastPointerWorldRef.current
    ) {
      const dx = world.x - lastPointerWorldRef.current.x;
      const dy = world.y - lastPointerWorldRef.current.y;
      applyElementsWithInvariants((current) =>
        current.map((element) => {
          if (element.id !== selectedId || element.kind === "ink") {
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
        setMarqueeSelection({
          start,
          end: world,
        });
        return;
      }
      setStroke((current) => [...current, world]);
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

  const handlePointerUp = () => {
    if (readOnly) {
      return;
    }

    if (dragMode === "move" || dragMode === "resize") {
      setDragMode(null);
      setResizeHandle(null);
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
        setMarqueeSelection(null);
        setDragMode(null);
        setIsPanning(false);
        setHoveredElementId(null);
        dragStartRef.current = null;
        lastPointerWorldRef.current = null;
        return;
      }

      const recognizedElement = result.element;
      if (recognizedElement) {
        const snappedElement = {
          ...recognizedElement,
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
      }
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

  const handleKeepInk = () => {
    if (readOnly) {
      return;
    }

    if (pendingStroke && pendingStroke.length > 1) {
      const inkElement = createInk(pendingStroke);
      applyElementsWithInvariants((current) => [...current, inkElement]);
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
    if (readOnly) {
      return;
    }

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

      applyElementsWithInvariants((current) =>
        nudgeSelectedElements(current, selection.ids, dx, dy),
      );
    },
    [applyElementsWithInvariants, selection.ids],
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
        <span aria-live="polite">
          Zoom: {summary.scale.toFixed(2)} | Selected: {summary.selected}
        </span>
      </div>
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
        <DocumentPersistenceControls
          onSave={handleSave}
          onLoad={handleLoad}
          onExportYaml={handleExport}
          onExportSvg={handleExportSvg}
          onExportPng={handleExportPng}
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

      {selectedActions.length > 0 && (
        <ContextPalette
          actions={selectedActions}
          profileId={profileId}
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
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredElementId(null)}
        onWheel={handleWheel}
      >
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
            background: "rgba(17, 24, 39, 0.78)",
            border: "1px solid rgba(255,255,255,0.2)",
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
                  selection.ids.includes(element.id) ? "#f97316" : "rgba(229, 231, 235, 0.75)",
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
              border: "1px solid #22d3ee",
              background: "rgba(34, 211, 238, 0.12)",
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
          <ConnectionPorts ports={hoveredPorts} />
          {marqueeSelection && (
            <div
              aria-label="Selection marquee"
              style={{
                position: "absolute",
                left: Math.min(marqueeSelection.start.x, marqueeSelection.end.x),
                top: Math.min(marqueeSelection.start.y, marqueeSelection.end.y),
                width: Math.abs(marqueeSelection.end.x - marqueeSelection.start.x),
                height: Math.abs(marqueeSelection.end.y - marqueeSelection.start.y),
                border: "1px dashed #38bdf8",
                background: "rgba(56, 189, 248, 0.15)",
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
                background: "#f97316",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          )}
          {visibleElements.map((element) => {
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
