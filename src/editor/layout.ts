import type { DiagramElement } from "./types";

export type AutoLayoutAlgorithm = "layered" | "tree" | "radial" | "grid";

const elementGapX = 180;
const elementGapY = 130;

function isLayoutTarget(element: DiagramElement): boolean {
  return element.kind !== "line" && element.kind !== "ink";
}

function centerOf(elements: DiagramElement[]): { x: number; y: number } {
  if (elements.length === 0) {
    return { x: 240, y: 180 };
  }
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

function layoutGrid(movable: DiagramElement[]): Map<string, { x: number; y: number }> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(movable.length)));
  const originX = Math.min(...movable.map((element) => element.x));
  const originY = Math.min(...movable.map((element) => element.y));
  const updates = new Map<string, { x: number; y: number }>();
  movable.forEach((element, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    updates.set(element.id, {
      x: originX + column * elementGapX,
      y: originY + row * elementGapY,
    });
  });
  return updates;
}

function layoutRadial(movable: DiagramElement[]): Map<string, { x: number; y: number }> {
  const center = centerOf(movable);
  const radius = Math.max(120, movable.length * 22);
  const updates = new Map<string, { x: number; y: number }>();
  movable.forEach((element, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, movable.length);
    updates.set(element.id, {
      x: center.x + Math.cos(angle) * radius - element.width / 2,
      y: center.y + Math.sin(angle) * radius - element.height / 2,
    });
  });
  return updates;
}

function layoutTree(movable: DiagramElement[]): Map<string, { x: number; y: number }> {
  const byId = new Map(movable.map((element) => [element.id, element]));
  const roots = movable.filter((element) => !element.parentId || !byId.has(element.parentId));
  const ordered = [...roots];
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const children = movable.filter((candidate) => candidate.parentId === current.id);
    ordered.push(...children);
    queue.push(...children);
  }
  const updates = new Map<string, { x: number; y: number }>();
  const originX = Math.min(...movable.map((element) => element.x));
  const originY = Math.min(...movable.map((element) => element.y));
  ordered.forEach((element, index) => {
    const depth = (() => {
      let current = element;
      let value = 0;
      while (current.parentId && byId.has(current.parentId)) {
        value += 1;
        current = byId.get(current.parentId) as DiagramElement;
      }
      return value;
    })();
    const depthSiblings = ordered.filter((candidate) => {
      let current = candidate;
      let value = 0;
      while (current.parentId && byId.has(current.parentId)) {
        value += 1;
        current = byId.get(current.parentId) as DiagramElement;
      }
      return value === depth;
    });
    const depthIndex = depthSiblings.findIndex((candidate) => candidate.id === element.id);
    updates.set(element.id, {
      x: originX + depth * elementGapX,
      y: originY + depthIndex * elementGapY,
    });
    if (index === -1) {
      return;
    }
  });
  return updates;
}

function layoutLayered(movable: DiagramElement[]): Map<string, { x: number; y: number }> {
  const updates = new Map<string, { x: number; y: number }>();
  const byId = new Map(movable.map((element) => [element.id, element]));
  const indegree = new Map<string, number>(movable.map((element) => [element.id, 0]));

  movable.forEach((element) => {
    if (!element.connector) {
      return;
    }
    if (indegree.has(element.connector.toId)) {
      indegree.set(
        element.connector.toId,
        (indegree.get(element.connector.toId) ?? 0) + 1,
      );
    }
  });

  const layers = new Map<number, DiagramElement[]>();
  const queue = movable
    .filter((element) => (indegree.get(element.id) ?? 0) === 0)
    .map((element) => ({ element, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.element.id)) {
      continue;
    }
    visited.add(next.element.id);
    const entries = layers.get(next.depth) ?? [];
    entries.push(next.element);
    layers.set(next.depth, entries);

    movable.forEach((candidate) => {
      if (candidate.connector?.fromId === next.element.id && byId.has(candidate.connector.toId)) {
        queue.push({ element: byId.get(candidate.connector.toId) as DiagramElement, depth: next.depth + 1 });
      }
    });
  }

  movable.forEach((element) => {
    if (!visited.has(element.id)) {
      const entries = layers.get(0) ?? [];
      entries.push(element);
      layers.set(0, entries);
    }
  });

  const originX = Math.min(...movable.map((element) => element.x));
  const originY = Math.min(...movable.map((element) => element.y));
  [...layers.entries()].forEach(([depth, nodes]) => {
    nodes.forEach((element, index) => {
      updates.set(element.id, {
        x: originX + depth * elementGapX,
        y: originY + index * elementGapY,
      });
    });
  });

  return updates;
}

export function applyAutoLayout(
  elements: DiagramElement[],
  algorithm: AutoLayoutAlgorithm,
  selectedIds: string[] = [],
): DiagramElement[] {
  const selectedIdSet = new Set(selectedIds);
  const candidates = elements.filter(
    (element) =>
      isLayoutTarget(element) &&
      !element.locked &&
      (selectedIdSet.size === 0 || selectedIdSet.has(element.id)),
  );
  if (candidates.length < 2) {
    return elements;
  }

  const positions =
    algorithm === "grid"
      ? layoutGrid(candidates)
      : algorithm === "radial"
        ? layoutRadial(candidates)
        : algorithm === "tree"
          ? layoutTree(candidates)
          : layoutLayered(candidates);

  return elements.map((element) => {
    const next = positions.get(element.id);
    if (!next) {
      return element;
    }
    return {
      ...element,
      x: next.x,
      y: next.y,
    };
  });
}
