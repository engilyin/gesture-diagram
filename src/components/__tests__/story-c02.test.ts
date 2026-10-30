import { findSnapGuide, snapToGrid } from "../../editor/snapping";
import type { DiagramElement } from "../../editor/types";

describe("STORY-C02 snapping helpers", () => {
  it("rounds coordinates to the nearest grid point", () => {
    expect(snapToGrid(19)).toBe(16);
    expect(snapToGrid(24)).toBe(32);
  });

  it("prefers snapping to nearby shape guides", () => {
    const moving: DiagramElement = {
      id: "moving",
      kind: "rect",
      x: 137,
      y: 16,
      width: 40,
      height: 40,
    };
    const anchor: DiagramElement = {
      id: "anchor",
      kind: "rect",
      x: 140,
      y: 80,
      width: 40,
      height: 40,
    };

    const snapped = findSnapGuide(moving, [anchor]);

    expect(snapped.x).toBe(140);
    expect(snapped.guide).toEqual({ axis: "x", position: 140 });
  });

  it("returns no guide when no nearby shape alignment exists", () => {
    const moving: DiagramElement = {
      id: "moving",
      kind: "rect",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    };
    const far: DiagramElement = {
      id: "far",
      kind: "rect",
      x: 400,
      y: 400,
      width: 40,
      height: 40,
    };

    const snapped = findSnapGuide(moving, [far]);

    expect(snapped.guide).toBeNull();
    expect(snapped.x).toBe(10);
    expect(snapped.y).toBe(10);
  });
});
