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
      };
    }

    const from = elementsById.get(fromId);
    const to = elementsById.get(toId);
    if (!from || !to || !isConnectable(from) || !isConnectable(to)) {
      changed = true;
      return {
        ...element,
        connector: undefined,
      };
    }

    const fromAnchorContainer = getCollapsedAncestor(from, elementsById);
    const toAnchorContainer = getCollapsedAncestor(to, elementsById);
    const fromAnchor = fromAnchorContainer ?? from;
    const toAnchor = toAnchorContainer ?? to;

    const fromAnchorCenter = elementCenter(fromAnchor);
    const toAnchorCenter = elementCenter(toAnchor);

    const fromPoint =
      fromAnchorContainer != null
        ? pointOnElementBorderToward(fromAnchor, toAnchorCenter)
        : fromAnchorCenter;
    const toPoint =
      toAnchorContainer != null
        ? pointOnElementBorderToward(toAnchor, fromAnchorCenter)
        : toAnchorCenter;

    const nextX = Math.min(fromPoint.x, toPoint.x);
    const nextY = Math.min(fromPoint.y, toPoint.y);
    const nextWidth = Math.max(12, Math.abs(toPoint.x - fromPoint.x));
    const nextHeight = Math.max(12, Math.abs(toPoint.y - fromPoint.y));

    if (
      element.x !== nextX ||
      element.y !== nextY ||
      element.width !== nextWidth ||
      element.height !== nextHeight
    ) {
      changed = true;
      return {
        ...element,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      };
    }

    return element;
  });

  return {
    valid: !changed,
    repairedElements,
  };
}
