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

    return element;
  });

  return {
    valid: !changed,
    repairedElements,
  };
}
