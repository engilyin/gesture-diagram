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

    const fromCenter = elementCenter(from);
    const toCenter = elementCenter(to);
    const nextX = Math.min(fromCenter.x, toCenter.x);
    const nextY = Math.min(fromCenter.y, toCenter.y);
    const nextWidth = Math.max(12, Math.abs(toCenter.x - fromCenter.x));
    const nextHeight = Math.max(12, Math.abs(toCenter.y - fromCenter.y));

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
