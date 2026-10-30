import type { Point, DiagramElement } from "./types";
import {
  createDiamond,
  createEllipse,
  createLine,
  createRectangle,
  createText,
  createTriangle,
} from "./shapes";

export type RecognitionKind =
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "line"
  | "text"
  | "ink";

export type RecognitionResult = {
  kind: RecognitionKind;
  confidence: number;
  element?: DiagramElement;
};

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getAxisEdgeRatio(
  points: Point[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  const tolerance = 12;
  const edgePoints = points.filter(
    (point) =>
      Math.abs(point.x - minX) <= tolerance ||
      Math.abs(point.x - maxX) <= tolerance ||
      Math.abs(point.y - minY) <= tolerance ||
      Math.abs(point.y - maxY) <= tolerance,
  ).length;

  return edgePoints / points.length;
}

function countCornerHits(
  points: Point[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const tolerance = 18;

  return corners.filter((corner) =>
    points.some(
      (point) =>
        Math.abs(point.x - corner.x) <= tolerance &&
        Math.abs(point.y - corner.y) <= tolerance,
    ),
  ).length;
}

function countDiamondVertexHits(
  points: Point[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const vertices = [
    { x: centerX, y: minY },
    { x: maxX, y: centerY },
    { x: centerX, y: maxY },
    { x: minX, y: centerY },
  ];
  const tolerance = 16;

  return vertices.filter((vertex) =>
    points.some(
      (point) =>
        Math.abs(point.x - vertex.x) <= tolerance &&
        Math.abs(point.y - vertex.y) <= tolerance,
    ),
  ).length;
}

function countTriangleVertexHits(
  points: Point[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  const centerX = (minX + maxX) / 2;
  const vertices = [
    { x: centerX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const tolerance = 18;

  return vertices.filter((vertex) =>
    points.some(
      (point) =>
        Math.abs(point.x - vertex.x) <= tolerance &&
        Math.abs(point.y - vertex.y) <= tolerance,
    ),
  ).length;
}

function countSharpCorners(points: Point[]): number {
  let corners = 0;
  const angleThreshold = 0.85;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const vectorA = { x: current.x - previous.x, y: current.y - previous.y };
    const vectorB = { x: next.x - current.x, y: next.y - current.y };
    const lengthA = Math.hypot(vectorA.x, vectorA.y);
    const lengthB = Math.hypot(vectorB.x, vectorB.y);
    if (lengthA < 0.001 || lengthB < 0.001) {
      continue;
    }

    const dot = vectorA.x * vectorB.x + vectorA.y * vectorB.y;
    const cosine = Math.min(1, Math.max(-1, dot / (lengthA * lengthB)));
    const angle = Math.acos(cosine);
    if (angle > angleThreshold) {
      corners += 1;
    }
  }
  return corners;
}

export function recognizeStroke(points: Point[]): RecognitionResult {
  if (points.length < 3) {
    return { kind: "ink", confidence: 0.2 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const start = points[0];
  const end = points[points.length - 1];
  const closed = pointDistance(start, end) < 12;

  const pathLength = points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + pointDistance(points[index - 1], point);
  }, 0);

  const straightness =
    pathLength === 0 ? 0 : pointDistance(start, end) / pathLength;
  const scribbleLike =
    width >= 40 &&
    height >= 4 &&
    height <= 42 &&
    pathLength >= width * 1.05 &&
    straightness <= 0.92;
  const perimeterEstimate = 2 * (width + height);
  const lineLike =
    pathLength > 60 &&
    straightness > 0.75 &&
    (width > height * 2.5 || height > width * 2.5);
  const axisEdgeRatio = getAxisEdgeRatio(points, minX, maxX, minY, maxY);
  const cornerCount = countSharpCorners(points);
  const cornerHits = countCornerHits(points, minX, maxX, minY, maxY);
  const diamondVertexHits = countDiamondVertexHits(points, minX, maxX, minY, maxY);
  const triangleVertexHits = countTriangleVertexHits(points, minX, maxX, minY, maxY);
  const boxLike =
    closed &&
    width > 30 &&
    height > 30 &&
    pathLength > 80 &&
    pathLength < 1.8 * perimeterEstimate &&
    cornerHits >= 2;
  const aspectRatio = Math.min(width, height) / Math.max(width, height);
  const diamondLike =
    closed &&
    width > 30 &&
    height > 30 &&
    cornerCount >= 2 &&
    diamondVertexHits >= 3 &&
    cornerHits <= 1 &&
    aspectRatio > 0.35;
  const triangleLike =
    closed &&
    width > 28 &&
    height > 28 &&
    triangleVertexHits >= 3 &&
    cornerHits <= 2 &&
    aspectRatio > 0.35;
  const ellipseLike =
    closed &&
    width > 30 &&
    height > 30 &&
    !diamondLike &&
    !boxLike &&
    axisEdgeRatio < 0.96 &&
    cornerCount <= 8 &&
    aspectRatio > 0.3;

  if (scribbleLike) {
    const element = createText(minX, minY, width, Math.max(height, 48));
    return { kind: "text", confidence: 0.8, element };
  }

  if (diamondLike) {
    const element = createDiamond(minX, minY, width, height);
    return { kind: "diamond", confidence: 0.79, element };
  }

  if (ellipseLike) {
    const element = createEllipse(minX, minY, width, height);
    return { kind: "ellipse", confidence: 0.77, element };
  }

  if (triangleLike) {
    const element = createTriangle(minX, minY, width, height);
    return { kind: "triangle", confidence: 0.76, element };
  }

  if (boxLike) {
    const element = createRectangle(minX, minY, width, height);
    return { kind: "rect", confidence: 0.84, element };
  }

  if (lineLike) {
    const element = createLine(minX, minY, width, height);
    return { kind: "line", confidence: 0.8, element };
  }

  if (width > 50 || height > 50) {
    return { kind: "ink", confidence: 0.49 };
  }

  return { kind: "ink", confidence: 0.45 };
}
