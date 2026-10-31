import { describe, expect, it } from "vitest";
import {
  applyOpsWithLww,
  compareHybridLogicalClocks,
  createHybridLogicalClockGenerator,
  createOpsFromElementDiff,
  type DiagramOp,
} from "../ops";
import { createRectangle } from "../shapes";
import type { DiagramElement } from "../types";

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

describe("STORY-COL01 per-property LWW ops", () => {
  it("emits HLC clock metadata for property mutation ops", () => {
    const base = [createRectangle(20, 20, 120, 80)];
    const after = clone(base);
    after[0] = {
      ...after[0],
      x: 80,
      color: "#0f766e",
      text: "Updated",
    };

    const nextClock = createHybridLogicalClockGenerator("node-a", () => 1_700_000_000_000);
    const ops = createOpsFromElementDiff(base, after, {
      nodeId: "node-a",
      nextClock,
    });

    const mutationOps = ops.filter(
      (op) => op.type === "set-property" || op.type === "text-edit",
    );
    expect(mutationOps.length).toBeGreaterThanOrEqual(3);
    mutationOps.forEach((op) => {
      expect(op.clock?.nodeId).toBe("node-a");
      expect(typeof op.clock?.wallTime).toBe("number");
      expect(typeof op.clock?.counter).toBe("number");
    });
  });

  it("merges concurrent property ops by LWW per property", () => {
    const shape = createRectangle(20, 20, 120, 80);
    const base: DiagramElement[] = [shape];
    const ops: DiagramOp[] = [
      {
        type: "set-property",
        id: shape.id,
        property: "x",
        value: 60,
        clock: { wallTime: 100, counter: 0, nodeId: "alpha" },
      },
      {
        type: "set-property",
        id: shape.id,
        property: "color",
        value: "#2563eb",
        clock: { wallTime: 101, counter: 0, nodeId: "beta" },
      },
      {
        type: "set-property",
        id: shape.id,
        property: "x",
        value: 180,
        clock: { wallTime: 102, counter: 0, nodeId: "alpha" },
      },
      {
        type: "set-property",
        id: shape.id,
        property: "color",
        value: "#ef4444",
        clock: { wallTime: 100, counter: 3, nodeId: "gamma" },
      },
    ];
    const merged = applyOpsWithLww(base, ops);
    const updated = merged.elements.find((element) => element.id === shape.id);

    expect(updated?.x).toBe(180);
    expect(updated?.color).toBe("#2563eb");
  });

  it("uses node id as deterministic tiebreaker for equal HLC physical/logical parts", () => {
    const older = { wallTime: 100, counter: 2, nodeId: "alpha" };
    const newer = { wallTime: 100, counter: 2, nodeId: "beta" };
    expect(compareHybridLogicalClocks(older, newer)).toBeLessThan(0);
    expect(compareHybridLogicalClocks(newer, older)).toBeGreaterThan(0);
  });
});
