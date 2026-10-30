import { moveGroupedElements } from "./grouping";
import type { DiagramElement } from "./types";

export function getCycledSelectionId(
  elements: DiagramElement[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | null {
  if (elements.length === 0) {
    return null;
  }

  const currentIndex = currentId
    ? elements.findIndex((element) => element.id === currentId)
    : -1;

  if (currentIndex === -1) {
    return direction === 1 ? elements[0].id : elements[elements.length - 1].id;
  }

  const nextIndex = (currentIndex + direction + elements.length) % elements.length;
  return elements[nextIndex]?.id ?? null;
}

export function nudgeSelectedElements(
  elements: DiagramElement[],
  selectionIds: string[],
  dx: number,
  dy: number,
): DiagramElement[] {
  if (selectionIds.length === 0 || (dx === 0 && dy === 0)) {
    return elements;
  }

  return moveGroupedElements(elements, selectionIds, dx, dy);
}
