import type { DiagramDocument, DiagramElement } from "../types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toCellId(elementId: string, fallbackIndex: number): string {
  if (elementId.startsWith("drawio-")) {
    return elementId.slice("drawio-".length);
  }
  return `gd-${fallbackIndex}`;
}

function styleForElement(element: DiagramElement): string {
  if (element.kind === "container") {
    return "group;rounded=1;dashed=1;strokeColor=#334155;fillColor=none;";
  }
  if (element.kind === "ellipse") {
    return "ellipse;whiteSpace=wrap;html=1;strokeColor=#4f46e5;fillColor=#eef2ff;";
  }
  if (element.kind === "diamond") {
    return "rhombus;whiteSpace=wrap;html=1;strokeColor=#4f46e5;fillColor=#eef2ff;";
  }
  if (element.kind === "triangle") {
    return "triangle;whiteSpace=wrap;html=1;strokeColor=#4f46e5;fillColor=#eef2ff;";
  }
  if (element.kind === "text") {
    return "text;whiteSpace=wrap;html=1;strokeColor=none;fillColor=none;";
  }
  if (element.kind === "rect") {
    return "rounded=1;whiteSpace=wrap;html=1;strokeColor=#4f46e5;fillColor=#eef2ff;";
  }
  return "endArrow=block;html=1;strokeColor=#111827;";
}

function groupByLayer(elements: DiagramElement[]): Map<number, DiagramElement[]> {
  const grouped = new Map<number, DiagramElement[]>();
  elements.forEach((element) => {
    const layer = element.layer ?? 0;
    const current = grouped.get(layer) ?? [];
    current.push(element);
    grouped.set(layer, current);
  });
  if (grouped.size === 0) {
    grouped.set(0, []);
  }
  return grouped;
}

type ExportNode = {
  cellId: string;
  element: DiagramElement;
  parentCellId: string;
};

function buildLayerXml(layerElements: DiagramElement[], layerIndex: number): string {
  const nonLines = layerElements.filter((element) => element.kind !== "line");
  const lines = layerElements.filter((element) => element.kind === "line");
  const byId = new Map(nonLines.map((element) => [element.id, element]));
  const cellIdByElementId = new Map<string, string>();

  nonLines.forEach((element, index) => {
    cellIdByElementId.set(element.id, toCellId(element.id, index + 2));
  });

  const syntheticGroupsByGroupId = new Map<string, string>();
  nonLines.forEach((element, index) => {
    if (!element.groupId || syntheticGroupsByGroupId.has(element.groupId)) {
      return;
    }
    syntheticGroupsByGroupId.set(element.groupId, `group-${layerIndex}-${index + 2}`);
  });

  const rootNodes: ExportNode[] = nonLines.map((element) => {
    const parentFromContainer = element.parentId
      ? cellIdByElementId.get(element.parentId)
      : undefined;
    const parentFromGroup = element.groupId
      ? syntheticGroupsByGroupId.get(element.groupId)
      : undefined;
    return {
      cellId: cellIdByElementId.get(element.id) ?? toCellId(element.id, 2),
      element,
      parentCellId: parentFromContainer ?? parentFromGroup ?? "1",
    };
  });

  const syntheticGroupNodes = [...syntheticGroupsByGroupId.entries()].map(
    ([groupId, cellId]) => {
      const groupedElements = nonLines.filter((element) => element.groupId === groupId);
      const minX = Math.min(...groupedElements.map((element) => element.x));
      const minY = Math.min(...groupedElements.map((element) => element.y));
      const maxX = Math.max(
        ...groupedElements.map((element) => element.x + element.width),
      );
      const maxY = Math.max(
        ...groupedElements.map((element) => element.y + element.height),
      );
      const groupElement: DiagramElement = {
        id: `drawio-${cellId}`,
        kind: "container",
        x: minX - 16,
        y: minY - 16,
        width: Math.max(120, maxX - minX + 32),
        height: Math.max(80, maxY - minY + 32),
      };
      return {
        cellId,
        element: groupElement,
        parentCellId: "1",
      } satisfies ExportNode;
    },
  );

  const vertexCells = [...syntheticGroupNodes, ...rootNodes]
    .map((node) => {
      const value = node.element.text ? escapeXml(node.element.text) : "";
      return [
        `<mxCell id="${node.cellId}" value="${value}" style="${styleForElement(node.element)}" vertex="1" parent="${node.parentCellId}">`,
        `<mxGeometry x="${node.element.x}" y="${node.element.y}" width="${Math.max(1, node.element.width)}" height="${Math.max(1, node.element.height)}" as="geometry"/>`,
        "</mxCell>",
      ].join("");
    })
    .join("");

  const edgeCells = lines
    .map((element, index) => {
      if (!element.connector) {
        return "";
      }
      const source = cellIdByElementId.get(element.connector.fromId);
      const target = cellIdByElementId.get(element.connector.toId);
      if (!source || !target || !byId.has(element.connector.fromId) || !byId.has(element.connector.toId)) {
        return "";
      }
      const edgeId = toCellId(element.id, nonLines.length + index + 2);
      return [
        `<mxCell id="${edgeId}" edge="1" parent="1" source="${source}" target="${target}" style="${styleForElement(element)}">`,
        '<mxGeometry relative="1" as="geometry"/>',
        "</mxCell>",
      ].join("");
    })
    .join("");

  const graphModel = [
    '<mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0">',
    "<root>",
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    vertexCells,
    edgeCells,
    "</root>",
    "</mxGraphModel>",
  ].join("");

  return `<diagram id="layer-${layerIndex + 1}" name="Layer ${layerIndex + 1}">${graphModel}</diagram>`;
}

export function exportDrawIo(document: DiagramDocument): string {
  const layers = [...groupByLayer(document.elements).entries()].sort(
    ([left], [right]) => left - right,
  );
  const diagrams = layers
    .map(([, layerElements], index) => buildLayerXml(layerElements, index))
    .join("");
  return `<mxfile host="app.diagrams.net" version="24.7.17">${diagrams}</mxfile>`;
}
