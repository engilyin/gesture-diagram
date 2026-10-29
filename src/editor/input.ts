import type { Point } from './types';

export function normalizeStroke(points: Point[]): Point[] {
  return points.map((point) => ({
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  }));
}
