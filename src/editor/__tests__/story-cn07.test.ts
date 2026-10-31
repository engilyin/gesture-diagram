import { describe, expect, it } from "vitest";
import { enforceConnectorInvariants } from "../connectorGraph";
import type { DiagramElement } from "../types";

function shape(id: string, layer = 0): DiagramElement {
  return {
    id,
    kind: "rect",
    x: layer === 0 ? 80 : 340,
    y: 120,
    width: 120,
    height: 80,
    layer,
  };
}

describe("STORY-CN07 connector endpoint integrity", () => {
  it("removes connector elements when an endpoint no longer exists", () => {
    const source = shape("source");
    const connector: DiagramElement = {
      id: "connector",
      kind: "line",
      x: 100,
      y: 150,
      width: 220,
      height: 0,
      connector: {
        fromId: "source",
        toId: "missing-target",
      },
    };

    const repaired = enforceConnectorInvariants([source, connector]);
    expect(repaired.valid).toBe(false);
    expect(repaired.repairedElements.some((element) => element.id === "connector")).toBe(false);
  });
});
