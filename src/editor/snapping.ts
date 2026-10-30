import type { DiagramElement } from "./types";

export type SnapGuide = { axis: "x" | "y"; position: number };

const gridSize = 16;
const snapThreshold = 8;

export function snapToGrid(value: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function findSnapGuide(
  moving: DiagramElement,
  others: DiagramElement[],
): { x: number; y: number; guide: SnapGuide | null } {
  let snappedX = moving.x;
  let snappedY = moving.y;
  let bestGuide: SnapGuide | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  const movingX = [
    { value: moving.x, apply: (target: number) => target },
    {
      value: moving.x + moving.width / 2,
      apply: (target: number) => target - moving.width / 2,
    },
    {
      value: moving.x + moving.width,
      apply: (target: number) => target - moving.width,
    },
  ];
  const movingY = [
    { value: moving.y, apply: (target: number) => target },
    {
      value: moving.y + moving.height / 2,
      apply: (target: number) => target - moving.height / 2,
    },
    {
      value: moving.y + moving.height,
      apply: (target: number) => target - moving.height,
    },
  ];

  for (const other of others) {
    const otherX = [other.x, other.x + other.width / 2, other.x + other.width];
    const otherY = [other.y, other.y + other.height / 2, other.y + other.height];

    for (const point of movingX) {
      for (const target of otherX) {
        const distance = Math.abs(point.value - target);
        if (distance <= snapThreshold && distance < bestDistance) {
          bestDistance = distance;
          snappedX = point.apply(target);
          bestGuide = { axis: "x", position: target };
        }
      }
    }

    for (const point of movingY) {
      for (const target of otherY) {
        const distance = Math.abs(point.value - target);
        if (distance <= snapThreshold && distance < bestDistance) {
          bestDistance = distance;
          snappedY = point.apply(target);
          bestGuide = { axis: "y", position: target };
        }
      }
    }
  }

  return { x: snappedX, y: snappedY, guide: bestGuide };
}
