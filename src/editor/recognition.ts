import type { Point, DiagramElement } from "./types";
import { createRectangle, createLine } from "./shapes";

export type RecognitionKind = "rect" | "line" | "ink";

export type RecognitionResult = {
  kind: RecognitionKind;
  confidence: number;
  element?: DiagramElement;
};

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
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
  const perimeterEstimate = 2 * (width + height);
  const boxLike =
    closed &&
    width > 30 &&
    height > 30 &&
    pathLength > 80 &&
    pathLength < 1.8 * perimeterEstimate;
  const lineLike =
    pathLength > 60 &&
    straightness > 0.75 &&
    (width > height * 2.5 || height > width * 2.5);

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
