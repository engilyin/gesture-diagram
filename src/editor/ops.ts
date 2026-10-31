import type { DiagramElement } from "./types";

type DiagramElementPatchProperty = Exclude<keyof DiagramElement, "id">;

export type HybridLogicalClockTimestamp = {
  wallTime: number;
  counter: number;
  nodeId: string;
};

type DiagramOpBase = {
  clock?: HybridLogicalClockTimestamp;
};

export type DiagramOp = (
  | { type: "create"; element: DiagramElement }
  | { type: "delete"; id: string }
  | {
      type: "set-property";
      id: string;
      property: DiagramElementPatchProperty;
      value: DiagramElement[DiagramElementPatchProperty];
    }
  | { type: "reparent"; id: string; parentId?: string }
  | { type: "reorder"; id: string; layer?: number }
  | { type: "text-edit"; id: string; text?: string }
  | { type: "asset-ref"; id: string; assetRef: string | null }
) &
  DiagramOpBase;

type LwwClockKey = DiagramElementPatchProperty | "__create" | "__delete";

export type LwwClockState = {
  [elementId: string]: Partial<Record<LwwClockKey, HybridLogicalClockTimestamp>>;
};

const trackedProperties: DiagramElementPatchProperty[] = [
  "kind",
  "x",
  "y",
  "width",
  "height",
  "text",
  "textAlignHorizontal",
  "textAlignVertical",
  "textOverflowMode",
  "locked",
  "hidden",
  "color",
  "strokeWidth",
  "styleVariant",
  "rotation",
  "points",
  "layer",
  "groupId",
  "parentId",
  "containerLayoutMode",
  "collapsed",
  "connector",
  "connectorRouting",
  "portOffsets",
];

function cloneElement(element: DiagramElement): DiagramElement {
  return typeof structuredClone === "function"
    ? structuredClone(element)
    : (JSON.parse(JSON.stringify(element)) as DiagramElement);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareHybridLogicalClocks(
  left: HybridLogicalClockTimestamp,
  right: HybridLogicalClockTimestamp,
): number {
  if (left.wallTime !== right.wallTime) {
    return left.wallTime - right.wallTime;
  }
  if (left.counter !== right.counter) {
    return left.counter - right.counter;
  }
  return left.nodeId.localeCompare(right.nodeId);
}

export function createHybridLogicalClockGenerator(
  nodeId: string,
  now: () => number = () => Date.now(),
): () => HybridLogicalClockTimestamp {
  let lastWallTime = 0;
  let counter = 0;

  return () => {
    const wallTime = now();
    if (wallTime > lastWallTime) {
      lastWallTime = wallTime;
      counter = 0;
    } else {
      counter += 1;
    }
    return {
      wallTime: lastWallTime,
      counter,
      nodeId,
    };
  };
}

type CreateOpsOptions = {
  nodeId?: string;
  nextClock?: () => HybridLogicalClockTimestamp;
};

function clockKeyForOp(op: DiagramOp): { elementId: string; key: LwwClockKey } | null {
  if (op.type === "create") {
    return { elementId: op.element.id, key: "__create" };
  }
  if (op.type === "delete") {
    return { elementId: op.id, key: "__delete" };
  }
  if (op.type === "set-property") {
    return { elementId: op.id, key: op.property };
  }
  if (op.type === "reparent") {
    return { elementId: op.id, key: "parentId" };
  }
  if (op.type === "reorder") {
    return { elementId: op.id, key: "layer" };
  }
  if (op.type === "text-edit") {
    return { elementId: op.id, key: "text" };
  }
  return null;
}

function shouldApplyLwwOp(
  op: DiagramOp,
  state: LwwClockState,
): boolean {
  const target = clockKeyForOp(op);
  if (!target || !op.clock) {
    return true;
  }
  const previousClock = state[target.elementId]?.[target.key];
  return !previousClock || compareHybridLogicalClocks(op.clock, previousClock) > 0;
}

function recordLwwClock(op: DiagramOp, state: LwwClockState): void {
  const target = clockKeyForOp(op);
  if (!target || !op.clock) {
    return;
  }
  const previous = state[target.elementId] ?? {};
  state[target.elementId] = {
    ...previous,
    [target.key]: op.clock,
  };
}

export function applyOp(elements: DiagramElement[], op: DiagramOp): DiagramElement[] {
  if (op.type === "create") {
    if (elements.some((element) => element.id === op.element.id)) {
      return elements;
    }
    return [...elements, cloneElement(op.element)];
  }

  if (op.type === "delete") {
    return elements.filter((element) => element.id !== op.id);
  }

  if (op.type === "set-property") {
    return elements.map((element) =>
      element.id === op.id
        ? {
            ...element,
            [op.property]: op.value,
          }
        : element,
    );
  }

  if (op.type === "reparent") {
    return elements.map((element) =>
      element.id === op.id
        ? {
            ...element,
            parentId: op.parentId,
          }
        : element,
    );
  }

  if (op.type === "reorder") {
    return elements.map((element) =>
      element.id === op.id
        ? {
            ...element,
            layer: op.layer,
          }
        : element,
    );
  }

  if (op.type === "text-edit") {
    return elements.map((element) =>
      element.id === op.id
        ? {
            ...element,
            text: op.text,
          }
        : element,
    );
  }

  return elements;
}

export function applyOps(elements: DiagramElement[], ops: DiagramOp[]): DiagramElement[] {
  return ops.reduce((current, op) => applyOp(current, op), elements);
}

export function applyOpsWithLww(
  elements: DiagramElement[],
  ops: DiagramOp[],
  existingClockState: LwwClockState = {},
): { elements: DiagramElement[]; clockState: LwwClockState } {
  const state: LwwClockState = typeof structuredClone === "function"
    ? structuredClone(existingClockState)
    : (JSON.parse(JSON.stringify(existingClockState)) as LwwClockState);
  let current = elements;

  ops.forEach((op) => {
    if (!shouldApplyLwwOp(op, state)) {
      return;
    }
    current = applyOp(current, op);
    recordLwwClock(op, state);
  });

  return { elements: current, clockState: state };
}

function getInverseOpForState(
  before: DiagramElement[],
  op: DiagramOp,
): DiagramOp | null {
  if (op.type === "create") {
    return {
      type: "delete",
      id: op.element.id,
    };
  }

  if (op.type === "delete") {
    const deleted = before.find((element) => element.id === op.id);
    return deleted
      ? {
          type: "create",
          element: cloneElement(deleted),
        }
      : null;
  }

  if (op.type === "set-property") {
    const target = before.find((element) => element.id === op.id);
    if (!target) {
      return null;
    }
    return {
      type: "set-property",
      id: op.id,
      property: op.property,
      value: target[op.property],
    };
  }

  if (op.type === "reparent") {
    const target = before.find((element) => element.id === op.id);
    if (!target) {
      return null;
    }
    return {
      type: "reparent",
      id: op.id,
      parentId: target.parentId,
    };
  }

  if (op.type === "reorder") {
    const target = before.find((element) => element.id === op.id);
    if (!target) {
      return null;
    }
    return {
      type: "reorder",
      id: op.id,
      layer: target.layer,
    };
  }

  if (op.type === "text-edit") {
    const target = before.find((element) => element.id === op.id);
    if (!target) {
      return null;
    }
    return {
      type: "text-edit",
      id: op.id,
      text: target.text,
    };
  }

  return {
    type: "asset-ref",
    id: op.id,
    assetRef: null,
  };
}

export function createInverseOps(before: DiagramElement[], ops: DiagramOp[]): DiagramOp[] {
  const inverse: DiagramOp[] = [];
  let current = before;

  ops.forEach((op) => {
    const inverseOp = getInverseOpForState(current, op);
    if (inverseOp) {
      inverse.unshift(inverseOp);
    }
    current = applyOp(current, op);
  });

  return inverse;
}

export function createOpsFromElementDiff(
  before: DiagramElement[],
  after: DiagramElement[],
  options: CreateOpsOptions = {},
): DiagramOp[] {
  const nextClock =
    options.nextClock ??
    createHybridLogicalClockGenerator(options.nodeId ?? "local");
  const beforeById = new Map(before.map((element) => [element.id, element]));
  const afterById = new Map(after.map((element) => [element.id, element]));
  const ops: DiagramOp[] = [];

  before.forEach((element) => {
    if (!afterById.has(element.id)) {
      ops.push({
        type: "delete",
        id: element.id,
        clock: nextClock(),
      });
    }
  });

  after.forEach((element) => {
    const previous = beforeById.get(element.id);
    if (!previous) {
      ops.push({
        type: "create",
        element: cloneElement(element),
        clock: nextClock(),
      });
      return;
    }

    trackedProperties.forEach((property) => {
      if (valuesEqual(previous[property], element[property])) {
        return;
      }

      if (property === "parentId") {
        ops.push({
          type: "reparent",
          id: element.id,
          parentId: element.parentId,
          clock: nextClock(),
        });
        return;
      }

      if (property === "layer") {
        ops.push({
          type: "reorder",
          id: element.id,
          layer: element.layer,
          clock: nextClock(),
        });
        return;
      }

      if (property === "text") {
        ops.push({
          type: "text-edit",
          id: element.id,
          text: element.text,
          clock: nextClock(),
        });
        return;
      }

      ops.push({
        type: "set-property",
        id: element.id,
        property,
        value: element[property],
        clock: nextClock(),
      });
    });
  });

  return ops;
}
