import type { Point, DiagramElement } from './types';
import { createRectangle, createLine } from './shapes';

export type RecognitionKind = 'rect' | 'line' | 'ink';

export type RecognitionResult = {
  kind: RecognitionKind;
  confidence: number;
  element?: DiagramElement;
};

export function recognizeStroke(points: Point[]): RecognitionResult {
  if (points.length < 3) {
    return { kind: 'ink', confidence: 0.2 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const closed =
    points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y;

  if (width > 30 && height > 30 && closed) {
    const element = createRectangle(minX, minY, width, height);
    return { kind: 'rect', confidence: 0.82, element };
  }

  if (width > 50 || height > 50) {
    const element = createLine(minX, minY, width, height);
    return { kind: 'line', confidence: 0.7, element };
  }

  return { kind: 'ink', confidence: 0.45 };
}
