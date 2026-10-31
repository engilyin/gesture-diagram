import { describe, expect, it } from "vitest";
import { enforceConnectorInvariants } from "../connectorGraph";
import type { DiagramElement } from "../types";

function rect(id: string, x: number, y: number): DiagramElement {
  return {
    id,
    kind: "rect",
    x,
    y,
    width: 140,
    height: 90,
  };
}

function connector(fromId: string, toId: string): DiagramElement {
  return {
    id: "c1",
    kind: "line",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    connector: { fromId, toId },
    connectorRouting: "orthogonal",
  };
}

function isStrictlyInside(point: { x: number; y: number }, element: DiagramElement): boolean {
  return (
    point.x > element.x &&
    point.x < element.x + element.width &&
    point.y > element.y &&
    point.y < element.y + element.height
  );
}

describe("STORY-CN04 orthogonal connector routing", () => {
  it("routes orthogonal connectors with right-angle bends outside connected shapes", () => {
    const source = rect("source", 120, 120);
    const target = rect("target", 420, 300);
    const result = enforceConnectorInvariants([source, target, connector(source.id, target.id)]);
    const routed = result.repairedElements.find((element) => element.id === "c1");
    const points = routed?.points ?? [];

    expect(points.length).toBeGreaterThanOrEqual(3);
    let hasVerticalSegment = false;
    let hasHorizontalSegment = false;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) {
        continue;
      }
      if (previous.x === current.x) {
        hasVerticalSegment = true;
      }
      if (previous.y === current.y) {
        hasHorizontalSegment = true;
      }
    }
    expect(hasVerticalSegment).toBe(true);
    expect(hasHorizontalSegment).toBe(true);

    const intermediate = points.slice(1, -1);
    expect(intermediate.some((point) => isStrictlyInside(point, source))).toBe(false);
    expect(intermediate.some((point) => isStrictlyInside(point, target))).toBe(false);
  });

  it("re-routes orthogonal connectors when connected shapes move", () => {
    const source = rect("source", 120, 120);
    const target = rect("target", 420, 300);
    const initial = enforceConnectorInvariants([source, target, connector(source.id, target.id)])
      .repairedElements.find((element) => element.id === "c1");
    const movedTarget = { ...target, x: 640, y: 160 };
    const rerouted = enforceConnectorInvariants([source, movedTarget, connector(source.id, target.id)])
      .repairedElements.find((element) => element.id === "c1");

    expect(rerouted?.points).not.toEqual(initial?.points);
  });
});
