import { moveElement } from './transform';
import type { DiagramElement } from './types';

export function groupElements(
  elements: DiagramElement[],
  ids: string[],
  groupId: string,
): DiagramElement[] {
  const idSet = new Set(ids);
  return elements.map((element) =>
    idSet.has(element.id) ? { ...element, groupId } : element,
  );
}

export function ungroupElements(
  elements: DiagramElement[],
  groupId: string,
): DiagramElement[] {
  return elements.map((element) =>
    element.groupId === groupId ? { ...element, groupId: undefined } : element,
  );
}

export function getGroupedSelectionIds(
  elements: DiagramElement[],
  selectionIds: string[],
): string[] {
  const groupIds = new Set(
    elements
      .filter((element) => selectionIds.includes(element.id) && element.groupId)
      .map((element) => element.groupId as string),
  );

  if (groupIds.size === 0) {
    return [...selectionIds];
  }

  const expanded = new Set(selectionIds);
  for (const element of elements) {
    if (element.groupId && groupIds.has(element.groupId)) {
      expanded.add(element.id);
    }
  }

  return [...expanded];
}

export function moveGroupedElements(
  elements: DiagramElement[],
  selectionIds: string[],
  dx: number,
  dy: number,
): DiagramElement[] {
  const idsToMove = new Set(getGroupedSelectionIds(elements, selectionIds));
  return elements.map((element) =>
    idsToMove.has(element.id)
      ? {
          ...element,
          ...moveElement(element, dx, dy),
        }
      : element,
  );
}
