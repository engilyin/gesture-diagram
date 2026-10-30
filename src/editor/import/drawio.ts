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

export function importDrawIo(source: string): DrawIoImportResult {
  const parser = new DOMParser();
  const xml = parser.parseFromString(source, "text/xml");
  const parseError = xml.querySelector("parsererror");
  if (parseError) {
    throw new Error("draw.io import failed: malformed XML");
  }

  const cells = Array.from(xml.querySelectorAll("mxCell"));
  const vertexCells = cells.filter(
    (cell) => cell.getAttribute("vertex") === "1",
  );
  const edgeCells = cells.filter((cell) => cell.getAttribute("edge") === "1");

  const elements: DiagramElement[] = [];
  const centerByCellId = new Map<string, { x: number; y: number }>();

  for (const cell of vertexCells) {
    const geometry = cell.querySelector("mxGeometry");
    const x = parseNumber(geometry?.getAttribute("x") ?? null, 0);
    const y = parseNumber(geometry?.getAttribute("y") ?? null, 0);
    const width = parseNumber(geometry?.getAttribute("width") ?? null, 120);
    const height = parseNumber(geometry?.getAttribute("height") ?? null, 60);
    const id = `drawio-${cell.getAttribute("id") ?? crypto.randomUUID()}`;

    elements.push({
      id,
      kind: "rect",
      x,
      y,
      width,
      height,
      strokeWidth: 2,
      color: "#4f46e5",
    });

    const cellId = cell.getAttribute("id");
    if (cellId) {
      centerByCellId.set(cellId, { x: x + width / 2, y: y + height / 2 });
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
      connector: {
        fromId: `drawio-${sourceId}`,
        toId: `drawio-${targetId}`,
      },
    });
  }

  const unsupportedStyles = cells.filter((cell) => {
    const style = cell.getAttribute("style");
    return Boolean(style && style.includes("shape=uml"));
  });

  return {
    document: {
      version: "0.1.0",
      elements,
    },
    fidelity: createFidelityReport(
      unsupportedStyles.length > 0
        ? [
            {
              code: "unsupported_style",
              message: `Ignored ${unsupportedStyles.length} unsupported draw.io style entries.`,
            },
          ]
        : [],
    ),
  };
}
