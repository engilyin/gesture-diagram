import { createFidelityReport, type FidelityReport } from "./fidelity";
import type { DiagramDocument, DiagramElement } from "../types";

type MermaidImportResult = {
  document: DiagramDocument;
  fidelity: FidelityReport;
};

function normalizeNode(raw: string): string {
  return raw
    .trim()
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/"/g, "");
}

export function importMermaid(source: string): MermaidImportResult {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("flowchart"));

  const edges = lines
    .map((line) => line.match(/^(.+?)-+>?(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      from: normalizeNode(match[1]),
      to: normalizeNode(match[2]),
    }))
    .filter((edge) => edge.from.length > 0 && edge.to.length > 0);

  if (edges.length === 0) {
    throw new Error("Mermaid import failed: no supported edges found");
  }

  const nodes = Array.from(
    new Set(edges.flatMap((edge) => [edge.from, edge.to])),
  );
  const nodeIndex = new Map(nodes.map((node, index) => [node, index]));

  const elements: DiagramElement[] = nodes.map((node, index) => {
    const id = `mermaid-node-${index}`;
    return {
      id,
      kind: "rect",
      x: 80 + index * 220,
      y: 120 + (index % 2) * 120,
      width: 160,
      height: 72,
      color: "#4f46e5",
      strokeWidth: 2,
    };
  });

  for (const edge of edges) {
    const fromIndex = nodeIndex.get(edge.from);
    const toIndex = nodeIndex.get(edge.to);
    if (fromIndex === undefined || toIndex === undefined) {
      continue;
    }

    const fromId = `mermaid-node-${fromIndex}`;
    const toId = `mermaid-node-${toIndex}`;
    const fromElement = elements[fromIndex];
    const toElement = elements[toIndex];

    elements.push({
      id: `mermaid-edge-${fromIndex}-${toIndex}`,
      kind: "line",
      x: fromElement.x + fromElement.width / 2,
      y: fromElement.y + fromElement.height / 2,
      width:
        toElement.x +
        toElement.width / 2 -
        (fromElement.x + fromElement.width / 2),
      height:
        toElement.y +
        toElement.height / 2 -
        (fromElement.y + fromElement.height / 2),
      color: "#111827",
      strokeWidth: 3,
      connector: {
        fromId,
        toId,
      },
    });
  }

  return {
    document: {
      version: "0.1.0",
      elements,
    },
    fidelity: createFidelityReport([]),
  };
}
