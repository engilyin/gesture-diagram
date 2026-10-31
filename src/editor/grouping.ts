import { moveElement } from './transform';
import type { DiagramElement } from './types';

export const CONTAINER_PADDING = 24;
export const COLLAPSED_CONTAINER_HEIGHT = 40;
const MIN_CONTAINER_WIDTH = 160;
const MIN_CONTAINER_HEIGHT = 120;

export function isContainerElement(element: DiagramElement): boolean {
  return element.kind === "container";
}

function getElementArea(element: DiagramElement): number {
  return Math.max(0, element.width) * Math.max(0, element.height);
}

function isElementInsideContainer(
  element: DiagramElement,
  container: DiagramElement,
): boolean {
  return (
    element.x >= container.x &&
    element.y >= container.y &&
    element.x + element.width <= container.x + container.width &&
    element.y + element.height <= container.y + container.height
  );
}

export function collectOwnedDescendantIds(
  elements: DiagramElement[],
  parentIds: Iterable<string>,
): string[] {
  const parentQueue = [...parentIds];
  const descendantIds = new Set<string>();
  while (parentQueue.length > 0) {
    const parentId = parentQueue.shift();
    if (!parentId) {
      continue;
    }
    elements.forEach((element) => {
      if (element.parentId === parentId && !descendantIds.has(element.id)) {
        descendantIds.add(element.id);
        parentQueue.push(element.id);
      }
    });
  }
  return [...descendantIds];
}

function collectAncestorsById(
  elementsById: Map<string, DiagramElement>,
  element: DiagramElement,
): Set<string> {
  const ancestors = new Set<string>();
  let currentParentId = element.parentId;
  while (currentParentId) {
    if (ancestors.has(currentParentId)) {
      break;
    }
    ancestors.add(currentParentId);
    currentParentId = elementsById.get(currentParentId)?.parentId;
  }
  return ancestors;
}

export function reconcileContainerOwnership(
  elements: DiagramElement[],
): DiagramElement[] {
  const containers = elements.filter(isContainerElement);
  if (containers.length === 0) {
    return elements.map((element) => ({ ...element, parentId: undefined }));
  }

  const sortedContainers = [...containers].sort(
    (a, b) => getElementArea(a) - getElementArea(b),
  );
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const containerById = new Map(containers.map((container) => [container.id, container]));

  return elements.map((element) => {
    if (element.parentId) {
      const existingParent = containerById.get(element.parentId);
      if (existingParent?.collapsed) {
        return {
          ...element,
          parentId: existingParent.id,
        };
      }
    }

    const ancestors = collectAncestorsById(elementsById, element);
    const parent = sortedContainers.find((container) => {
      if (container.id === element.id || ancestors.has(container.id)) {
        return false;
      }
      return isElementInsideContainer(element, container);
    });

    return {
      ...element,
      parentId: parent?.id,
    };
  });
}

export function autoSizeContainers(
  elements: DiagramElement[],
  padding = CONTAINER_PADDING,
): DiagramElement[] {
  const arranged = elements.map((element) => ({ ...element }));
  const byId = new Map(arranged.map((element) => [element.id, element]));
  const childrenByParent = new Map<string, DiagramElement[]>();
  arranged.forEach((element) => {
    if (!element.parentId) {
      return;
    }
    const children = childrenByParent.get(element.parentId) ?? [];
    children.push(element);
    childrenByParent.set(element.parentId, children);
  });

  arranged.forEach((element) => {
    if (!isContainerElement(element)) {
      return;
    }

    const children = childrenByParent.get(element.id);
    if (element.collapsed) {
      if (children && children.length > 0) {
        const minX = Math.min(...children.map((child) => child.x));
        const maxX = Math.max(...children.map((child) => child.x + child.width));
        element.width = Math.max(maxX - minX + padding * 2, MIN_CONTAINER_WIDTH);
      } else {
        element.width = Math.max(element.width, MIN_CONTAINER_WIDTH);
      }
      element.height = COLLAPSED_CONTAINER_HEIGHT;
      return;
    }

    if (!children || children.length === 0) {
      return;
    }

    const layoutMode = element.containerLayoutMode ?? "free";
    if (layoutMode !== "free") {
      const sortedChildren = [...children].sort((left, right) =>
        left.y === right.y ? left.x - right.x : left.y - right.y,
      );
      const gap = 16;

      if (layoutMode === "row") {
        let cursorX = element.x + padding;
        const cursorY = element.y + padding;
        let maxHeight = 0;
        sortedChildren.forEach((child) => {
          const target = byId.get(child.id);
          if (!target) {
            return;
          }
          target.x = cursorX;
          target.y = cursorY;
          cursorX += target.width + gap;
          maxHeight = Math.max(maxHeight, target.height);
        });
        const rowWidth =
          sortedChildren.reduce((total, child) => total + child.width, 0) +
          Math.max(0, sortedChildren.length - 1) * gap;
        element.width = Math.max(rowWidth + padding * 2, MIN_CONTAINER_WIDTH);
        element.height = Math.max(maxHeight + padding * 2, MIN_CONTAINER_HEIGHT);
        return;
      }

      if (layoutMode === "column") {
        const cursorX = element.x + padding;
        let cursorY = element.y + padding;
        let maxWidth = 0;
        sortedChildren.forEach((child) => {
          const target = byId.get(child.id);
          if (!target) {
            return;
          }
          target.x = cursorX;
          target.y = cursorY;
          cursorY += target.height + gap;
          maxWidth = Math.max(maxWidth, target.width);
        });
        const columnHeight =
          sortedChildren.reduce((total, child) => total + child.height, 0) +
          Math.max(0, sortedChildren.length - 1) * gap;
        element.width = Math.max(maxWidth + padding * 2, MIN_CONTAINER_WIDTH);
        element.height = Math.max(columnHeight + padding * 2, MIN_CONTAINER_HEIGHT);
        return;
      }

      const columns = Math.max(1, Math.ceil(Math.sqrt(sortedChildren.length)));
      const cellWidth = Math.max(...sortedChildren.map((child) => child.width));
      const cellHeight = Math.max(...sortedChildren.map((child) => child.height));
      sortedChildren.forEach((child, index) => {
        const target = byId.get(child.id);
        if (!target) {
          return;
        }
        const row = Math.floor(index / columns);
        const column = index % columns;
        target.x = element.x + padding + column * (cellWidth + gap);
        target.y = element.y + padding + row * (cellHeight + gap);
      });
      const rows = Math.ceil(sortedChildren.length / columns);
      element.width = Math.max(
        columns * cellWidth + Math.max(0, columns - 1) * gap + padding * 2,
        MIN_CONTAINER_WIDTH,
      );
      element.height = Math.max(
        rows * cellHeight + Math.max(0, rows - 1) * gap + padding * 2,
        MIN_CONTAINER_HEIGHT,
      );
      return;
    }

    const minX = Math.min(...children.map((child) => child.x));
    const minY = Math.min(...children.map((child) => child.y));
    const maxX = Math.max(...children.map((child) => child.x + child.width));
    const maxY = Math.max(...children.map((child) => child.y + child.height));

    const width = Math.max(maxX - minX + padding * 2, MIN_CONTAINER_WIDTH);
    const height = Math.max(maxY - minY + padding * 2, MIN_CONTAINER_HEIGHT);
    element.x = minX - padding;
    element.y = minY - padding;
    element.width = width;
    element.height = height;
  });

  return arranged;
}

export function inheritLayerFromParents(
  elements: DiagramElement[],
): DiagramElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const resolvedLayer = new Map<string, number | undefined>();

  const resolveLayer = (
    element: DiagramElement,
    visited = new Set<string>(),
  ): number | undefined => {
    if (resolvedLayer.has(element.id)) {
      return resolvedLayer.get(element.id);
    }
    if (!element.parentId) {
      resolvedLayer.set(element.id, element.layer);
      return element.layer;
    }
    if (visited.has(element.id)) {
      resolvedLayer.set(element.id, element.layer);
      return element.layer;
    }
    visited.add(element.id);
    const parent = byId.get(element.parentId);
    const layer = parent ? resolveLayer(parent, visited) : element.layer;
    resolvedLayer.set(element.id, layer);
    return layer;
  };

  return elements.map((element) => ({
    ...element,
    layer: resolveLayer(element),
  }));
}

export function releaseChildrenFromParents(
  elements: DiagramElement[],
  parentIds: Iterable<string>,
): DiagramElement[] {
  const ids = new Set(parentIds);
  return elements.map((element) =>
    element.parentId && ids.has(element.parentId)
      ? { ...element, parentId: undefined }
      : element,
  );
}

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
  const groupedSelectionIds = getGroupedSelectionIds(elements, selectionIds);
  const selectedContainers = groupedSelectionIds.filter((id) => {
    const element = elements.find((item) => item.id === id);
    if (!element) {
      return false;
    }
    return isContainerElement(element);
  });
  const descendantIds = collectOwnedDescendantIds(elements, selectedContainers);
  const idsToMove = new Set([...groupedSelectionIds, ...descendantIds]);
  return elements.map((element) =>
    idsToMove.has(element.id)
      ? {
          ...element,
          ...moveElement(element, dx, dy),
        }
      : element,
  );
}
