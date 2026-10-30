import { describe, expect, it } from "vitest";
import { getVisibleElements } from "../culling";
import { createViewState } from "../viewport";
import type { DiagramElement } from "../types";

function element(id: string, x: number, y: number): DiagramElement {
  return {
    id,
    kind: "rect",
    x,
    y,
    width: 80,
    height: 40,
  };
}

describe("getVisibleElements", () => {
  it("returns only elements that intersect the visible bounds", () => {
    const view = createViewState();
    const visible = element("visible", 20, 40);
    const farAway = element("far", 5000, 5000);

    const result = getVisibleElements([visible, farAway], view, {
      width: 800,
      height: 600,
    });

    expect(result.map((item) => item.id)).toEqual(["visible"]);
  });

  it("returns empty array when there are no elements", () => {
    const result = getVisibleElements([], createViewState(), {
      width: 800,
      height: 600,
    });

    expect(result).toEqual([]);
  });

  it("includes elements within culling padding near viewport edges", () => {
    const nearEdge = element("edge", 900, 40);
    const result = getVisibleElements([nearEdge], createViewState(), {
      width: 800,
      height: 600,
    });

    expect(result.map((item) => item.id)).toEqual(["edge"]);
  });
});
