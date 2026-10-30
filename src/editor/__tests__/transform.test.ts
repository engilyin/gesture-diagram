import { describe, expect, it } from "vitest";
import { moveElement, resizeElement } from "../transform";

describe("transform helpers", () => {
  it("moves an element by the provided deltas", () => {
    const moved = moveElement({ x: 20, y: 30, width: 80, height: 60 }, 15, -5);

    expect(moved).toEqual({ x: 35, y: 25, width: 80, height: 60 });
  });

  it("resizes an element from south-east handle", () => {
    const resized = resizeElement(
      { x: 10, y: 10, width: 70, height: 40 },
      20,
      25,
      "se",
    );

    expect(resized).toEqual({ x: 10, y: 10, width: 90, height: 65 });
  });

  it("keeps size valid when resizing from north-west", () => {
    const resized = resizeElement(
      { x: 10, y: 10, width: 30, height: 30 },
      100,
      100,
      "nw",
    );

    expect(resized.width).toBeGreaterThanOrEqual(20);
    expect(resized.height).toBeGreaterThanOrEqual(20);
  });
});
