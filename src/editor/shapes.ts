import type { DiagramElement, Point } from "./types";

export function createRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramElement {
  return {
    id: crypto.randomUUID(),
    kind: "rect",
    x,
    y,
    width,
    height,
    color: "#4f46e5",
    strokeWidth: 2,
  };
}

export function createLine(
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramElement {
  const connectorWidth = Math.max(width, 12);
  const connectorHeight = Math.max(height, 12);

  return {
    id: crypto.randomUUID(),
    kind: "line",
    x,
    y,
    width: connectorWidth,
    height: connectorHeight,
    color: "#111827",
    strokeWidth: 3,
  };
}

export function createInk(points: Point[]): DiagramElement {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    id: crypto.randomUUID(),
    kind: "ink",
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 4),
    height: Math.max(maxY - minY, 4),
    color: "#2563eb",
    strokeWidth: 3,
    points,
  };
}
