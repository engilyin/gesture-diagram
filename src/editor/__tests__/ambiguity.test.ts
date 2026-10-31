import { describe, expect, it } from "vitest";
import { evaluateAmbiguity } from "../ambiguity";

describe("evaluateAmbiguity", () => {
  it("recognizes confident rectangle intent", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 70 },
      { x: 10, y: 70 },
      { x: 10, y: 10 },
    ];

    const result = evaluateAmbiguity(points);
    expect(result.kind).toBe("rect");
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  it("recognizes confident line intent", () => {
    const points = [
      { x: 0, y: 40 },
      { x: 40, y: 41 },
      { x: 80, y: 39 },
      { x: 120, y: 40 },
      { x: 180, y: 40 },
    ];

    const result = evaluateAmbiguity(points);
    expect(result.kind).toBe("line");
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  it("returns ranked alternatives for uncertain gestures", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 15 },
      { x: 15, y: 35 },
      { x: 45, y: 25 },
      { x: 30, y: 50 },
      { x: 55, y: 45 },
    ];

    const result = evaluateAmbiguity(points);
    expect(["rect", "line", "ink"]).toContain(result.kind);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});
