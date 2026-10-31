import { describe, expect, it } from "vitest";
import { createRectangle } from "../shapes";
import {
  applyOp,
  applyOps,
  createInverseOps,
  createOpsFromElementDiff,
  type DiagramOp,
} from "../ops";
import type { DiagramElement } from "../types";

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

describe("STORY-DM01 operations mutation model", () => {
  it("expresses create/delete/move/resize/style and text changes as serializable ops", () => {
    const shapeA = createRectangle(20, 20, 120, 80);
    const shapeB = createRectangle(220, 20, 120, 80);
    const base: DiagramElement[] = [shapeA, shapeB];

    const after: DiagramElement[] = [
      {
        ...shapeA,
        x: 44,
        y: 66,
        width: 180,
        height: 100,
        color: "#0f766e",
        text: "Gateway",
        parentId: "container-1",
        layer: 2,
      },
      {
        ...createRectangle(440, 180, 140, 92),
        text: "Created by op",
      },
    ];

    const ops = createOpsFromElementDiff(base, after);
    const serialized = JSON.stringify(ops);
    const parsed = JSON.parse(serialized) as DiagramOp[];

    expect(parsed.some((op) => op.type === "delete")).toBe(true);
    expect(parsed.some((op) => op.type === "create")).toBe(true);
    expect(parsed.some((op) => op.type === "set-property" && op.property === "x")).toBe(
      true,
    );
    expect(
      parsed.some((op) => op.type === "set-property" && op.property === "width"),
    ).toBe(true);
    expect(
      parsed.some((op) => op.type === "set-property" && op.property === "color"),
    ).toBe(true);
    expect(parsed.some((op) => op.type === "text-edit")).toBe(true);
    expect(parsed.some((op) => op.type === "reparent")).toBe(true);
    expect(parsed.some((op) => op.type === "reorder")).toBe(true);

    const applied = applyOps(base, parsed);
    expect(applied).toEqual(after);
  });

  it("builds inverse-op undo batches that restore previous state", () => {
    const original = [createRectangle(10, 10, 80, 80)];
    const next = clone(original);
    next[0] = {
      ...next[0],
      x: 120,
      y: 160,
      color: "#2563eb",
      text: "Edited",
    };

    const forwardOps = createOpsFromElementDiff(original, next);
    const inverseOps = createInverseOps(original, forwardOps);
    const applied = applyOps(original, forwardOps);
    const restored = applyOps(applied, inverseOps);

    expect(applied).toEqual(next);
    expect(restored).toEqual(original);
  });

  it("applies all op kinds through applyOp()", () => {
    const element = createRectangle(0, 0, 100, 60);
    const created = applyOp([], { type: "create", element });
    const edited = applyOp(created, {
      type: "text-edit",
      id: element.id,
      text: "Inline",
    });
    const reordered = applyOp(edited, {
      type: "reorder",
      id: element.id,
      layer: 3,
    });
    const reparented = applyOp(reordered, {
      type: "reparent",
      id: element.id,
      parentId: "container-1",
    });
    const assetRefNoop = applyOp(reparented, {
      type: "asset-ref",
      id: element.id,
      assetRef: "asset://example",
    });
    const deleted = applyOp(assetRefNoop, { type: "delete", id: element.id });

    expect(reparented[0]?.text).toBe("Inline");
    expect(reparented[0]?.layer).toBe(3);
    expect(reparented[0]?.parentId).toBe("container-1");
    expect(assetRefNoop).toEqual(reparented);
    expect(deleted).toEqual([]);
  });
});
