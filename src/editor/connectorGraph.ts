import type { DiagramElement, Point } from './types';

export type ConnectorInvariantResult = {
  valid: boolean;
  repairedElements: DiagramElement[];
};

function isConnectable(element: DiagramElement): boolean {
  return element.kind !== 'line' && element.kind !== 'ink';
}

function isPointInsideElement(point: Point, element: DiagramElement): boolean {
  const padding = 8;
  return (
    point.x >= element.x - padding &&
    point.x <= element.x + element.width + padding &&
    point.y >= element.y - padding &&
    point.y <= element.y + element.height + padding
  );
}

function connectorEndpoints(element: DiagramElement): { start: Point; end: Point } {
  return {
    start: { x: element.x, y: element.y },
    end: { x: element.x + element.width, y: element.y + element.height },
  };
}

function resolveConnectorRouting(
  element: DiagramElement,
): "straight" | "orthogonal" | "curved" {
  return element.connectorRouting ?? "straight";
}

function snapToGrid(value: number): number {
  return Math.round(value / 16) * 16;
}

function normalizeRoutedPoints(points: Point[]): Point[] {
  if (points.length < 2) {
    return points;
  }
  const deduped = points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1];
    return previous ? previous.x !== point.x || previous.y !== point.y : true;
  });

  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) {
      return true;
    }
    const previous = deduped[index - 1];
    const next = deduped[index + 1];
    if (!previous || !next) {
      return true;
    }
    const sameX = previous.x === point.x && point.x === next.x;
    const sameY = previous.y === point.y && point.y === next.y;
    return !(sameX || sameY);
  });
}

function routeOrthogonalPoints(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const clearance = 24;
  const points: Point[] = [{ ...start }];

  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1;
    const leadX = snapToGrid(start.x + direction * clearance);
    const tailX = snapToGrid(end.x - direction * clearance);
    points.push(
      { x: leadX, y: snapToGrid(start.y) },
      { x: leadX, y: snapToGrid(end.y) },
      { x: tailX, y: snapToGrid(end.y) },
    );
  } else {
    const direction = dy >= 0 ? 1 : -1;
    const leadY = snapToGrid(start.y + direction * clearance);
    const tailY = snapToGrid(end.y - direction * clearance);
    points.push(
      { x: snapToGrid(start.x), y: leadY },
      { x: snapToGrid(end.x), y: leadY },
      { x: snapToGrid(end.x), y: tailY },
    );
  }

  points.push({ ...end });
  return normalizeRoutedPoints(points);
}

function elementCenter(element: DiagramElement): Point {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function pointOnElementBorderToward(
  element: DiagramElement,
  target: Point,
): Point {
  const center = elementCenter(element);
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (dx === 0 && dy === 0) {
    return center;
  }

  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function getCollapsedAncestor(
  element: DiagramElement,
  elementsById: Map<string, DiagramElement>,
): DiagramElement | null {
  const visited = new Set<string>();
  let parentId = element.parentId;

  while (parentId) {
    if (visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    const parent = elementsById.get(parentId);
    if (!parent) {
      break;
    }
    if (parent.kind === "container" && parent.collapsed) {
      return parent;
    }
    parentId = parent.parentId;
  }

  return null;
}

export function attachConnectorEndpoints(
  elements: DiagramElement[],
  connector: DiagramElement,
): DiagramElement {
  if (connector.kind !== 'line') {
    return connector;
  }

  const candidates = elements.filter((element) => isConnectable(element));
  const { start, end } = connectorEndpoints(connector);
  const from = candidates.find((element) => isPointInsideElement(start, element));
  const to = candidates.find((element) => isPointInsideElement(end, element));

  if (!from || !to || from.id === to.id) {
    return {
      ...connector,
      connector: undefined,
    };
  }

  return {
    ...connector,
    connector: {
      fromId: from.id,
      toId: to.id,
    },
  };
}

export function enforceConnectorInvariants(
  elements: DiagramElement[],
): ConnectorInvariantResult {
  const validIds = new Set(elements.map((element) => element.id));
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  let changed = false;

  const repairedElements = elements.map((element) => {
    if (element.kind !== 'line' || !element.connector) {
      return element;
    }

    const { fromId, toId } = element.connector;
    if (fromId === toId || !validIds.has(fromId) || !validIds.has(toId)) {
      changed = true;
      return {
        ...element,
        connector: undefined,
        points: undefined,
      };
    }

    const from = elementsById.get(fromId);
    const to = elementsById.get(toId);
    if (!from || !to || !isConnectable(from) || !isConnectable(to)) {
      changed = true;
      return {
        ...element,
        connector: undefined,
        points: undefined,
      };
    }

    const fromAnchorContainer = getCollapsedAncestor(from, elementsById);
    const toAnchorContainer = getCollapsedAncestor(to, elementsById);
    const fromAnchor = fromAnchorContainer ?? from;
    const toAnchor = toAnchorContainer ?? to;

    const fromAnchorCenter = elementCenter(fromAnchor);
    const toAnchorCenter = elementCenter(toAnchor);

    const fromPoint = pointOnElementBorderToward(fromAnchor, toAnchorCenter);
    const toPoint = pointOnElementBorderToward(toAnchor, fromAnchorCenter);
    const connectorRouting = resolveConnectorRouting(element);
    const routedPoints =
      connectorRouting === "orthogonal"
        ? routeOrthogonalPoints(fromPoint, toPoint)
        : [fromPoint, toPoint];

    const xs = routedPoints.map((point) => point.x);
    const ys = routedPoints.map((point) => point.y);
    const nextX = Math.min(...xs);
    const nextY = Math.min(...ys);
    const nextWidth = Math.max(12, Math.max(...xs) - nextX);
    const nextHeight = Math.max(12, Math.max(...ys) - nextY);
    const pointsChanged = JSON.stringify(element.points ?? []) !== JSON.stringify(routedPoints);

    if (
      element.x !== nextX ||
      element.y !== nextY ||
      element.width !== nextWidth ||
      element.height !== nextHeight ||
      pointsChanged
    ) {
      changed = true;
      return {
        ...element,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        points: routedPoints,
      };
    }

    return element;
  });

  return {
    valid: !changed,
    repairedElements,
  };
}
