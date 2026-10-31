import { inflateRaw } from "pako";
import { createFidelityReport, type FidelityReport } from "./fidelity";
import type { DiagramDocument, DiagramElement } from "../types";

type DrawIoImportResult = {
  document: DiagramDocument;
  fidelity: FidelityReport;
};

function parseNumber(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseXmlDocument(source: string): XMLDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(source, "text/xml");
  const parseError = xml.querySelector("parsererror");
  if (parseError) {
    throw new Error("draw.io import failed: malformed XML");
  }
  return xml;
}

function decodeDiagramData(diagramData: string): string | null {
  const trimmed = diagramData.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("<mxGraphModel")) {
    return trimmed;
  }

  try {
    if (typeof atob !== "function") {
      return null;
    }
    const bytes = Uint8Array.from(atob(trimmed), (char) => char.charCodeAt(0));
    const inflatedBytes = inflateRaw(bytes);
    const inflatedText = new TextDecoder().decode(inflatedBytes);
    const candidates = [inflatedText];
    try {
      candidates.push(decodeURIComponent(inflatedText));
    } catch {
      // Ignore URI decoding failures and fall back to raw inflated text.
    }
    const decoded = candidates.find((candidate) =>
      candidate.includes("<mxGraphModel"),
    );
    if (decoded) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

function extractDiagramModels(sourceXml: XMLDocument): XMLDocument[] {
  const directModels = Array.from(sourceXml.querySelectorAll("mxGraphModel"));
  if (directModels.length > 0) {
    return [sourceXml];
  }

  const diagrams = Array.from(sourceXml.querySelectorAll("mxfile > diagram"));
  if (diagrams.length === 0) {
    return [sourceXml];
  }

  const documents: XMLDocument[] = [];
  diagrams.forEach((diagram) => {
    const decoded = decodeDiagramData(diagram.textContent ?? "");
    if (!decoded) {
      return;
    }
    const parsed = parseXmlDocument(decoded);
    if (parsed.querySelector("mxGraphModel")) {
      documents.push(parsed);
    }
  });

  return documents.length > 0 ? documents : [sourceXml];
}

function isContainerStyle(style: string | null): boolean {
  if (!style) {
    return false;
  }
  return style.includes("shape=swimlane") || style.includes("group");
}

export function importDrawIo(source: string): DrawIoImportResult {
  const xml = parseXmlDocument(source);
  const diagramModels = extractDiagramModels(xml);
  const fidelityWarnings: Array<{ code: string; message: string }> = [];

  const elements: DiagramElement[] = [];
  const centerByCellId = new Map<string, { x: number; y: number }>();
  const elementIdByCellId = new Map<string, string>();
  const vertexParentByCellId = new Map<string, string>();

  diagramModels.forEach((model, diagramIndex) => {
    const cells = Array.from(model.querySelectorAll("mxCell"));
    const vertexCells = cells.filter((cell) => cell.getAttribute("vertex") === "1");
    const edgeCells = cells.filter((cell) => cell.getAttribute("edge") === "1");

    for (const cell of vertexCells) {
      const geometry = cell.querySelector("mxGeometry");
      const x = parseNumber(geometry?.getAttribute("x") ?? null, 0);
      const y = parseNumber(geometry?.getAttribute("y") ?? null, 0);
      const width = parseNumber(geometry?.getAttribute("width") ?? null, 120);
      const height = parseNumber(geometry?.getAttribute("height") ?? null, 60);
      const cellId = cell.getAttribute("id");
      const id = `drawio-${cellId ?? crypto.randomUUID()}`;
      const style = cell.getAttribute("style");
      const parent = cell.getAttribute("parent");

      elements.push({
        id,
        kind: isContainerStyle(style) ? "container" : "rect",
        x,
        y,
        width,
        height,
        strokeWidth: 2,
        color: "#4f46e5",
        layer: diagramIndex,
      });

      if (cellId) {
        centerByCellId.set(cellId, { x: x + width / 2, y: y + height / 2 });
        elementIdByCellId.set(cellId, id);
        if (parent) {
          vertexParentByCellId.set(cellId, parent);
        }
      }
    }

    for (const edge of edgeCells) {
      const id = `drawio-${edge.getAttribute("id") ?? crypto.randomUUID()}`;
      const sourceId = edge.getAttribute("source");
      const targetId = edge.getAttribute("target");
      if (!sourceId || !targetId) {
        continue;
      }

      const sourceCenter = centerByCellId.get(sourceId);
      const targetCenter = centerByCellId.get(targetId);
      if (!sourceCenter || !targetCenter) {
        continue;
      }

      elements.push({
        id,
        kind: "line",
        x: sourceCenter.x,
        y: sourceCenter.y,
        width: targetCenter.x - sourceCenter.x,
        height: targetCenter.y - sourceCenter.y,
        strokeWidth: 3,
        color: "#111827",
        layer: diagramIndex,
        connector: {
          fromId: `drawio-${sourceId}`,
          toId: `drawio-${targetId}`,
        },
      });
    }
  });

  const groupedElements = elements.map((element) => {
    const cellId = element.id.replace(/^drawio-/, "");
    const parentCellId = vertexParentByCellId.get(cellId);
    if (!parentCellId) {
      return element;
    }

    const parentElementId = elementIdByCellId.get(parentCellId);
    if (!parentElementId) {
      return element;
    }

    const parentElement = elements.find((item) => item.id === parentElementId);
    if (!parentElement) {
      return element;
    }

    if (parentElement.kind === "container") {
      return {
        ...element,
        parentId: parentElement.id,
      };
    }

    return {
      ...element,
      groupId: `drawio-group-${parentCellId}`,
    };
  });

  const unsupportedStyles = Array.from(xml.querySelectorAll("mxCell")).filter((cell) => {
    const style = cell.getAttribute("style");
    return Boolean(style && style.includes("shape=uml"));
  });
  if (unsupportedStyles.length > 0) {
    fidelityWarnings.push({
      code: "unsupported_style",
      message: `Ignored ${unsupportedStyles.length} unsupported draw.io style entries.`,
    });
  }

  return {
    document: {
      version: "0.1.0",
      elements: groupedElements,
    },
    fidelity: createFidelityReport(fidelityWarnings),
  };
}
