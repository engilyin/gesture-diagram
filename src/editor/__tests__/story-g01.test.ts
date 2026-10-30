import { describe, expect, it } from "vitest";
import { recognizeStroke } from "../recognition";

type CorpusCase = {
  expected: ReturnType<typeof recognizeStroke>["kind"];
  points: Array<{ x: number; y: number }>;
};

describe("STORY-G01 recognition vocabulary", () => {
  it("recognizes ellipse and diamond strokes", () => {
    const ellipse = recognizeStroke([
      { x: 60, y: 20 },
      { x: 78, y: 24 },
      { x: 94, y: 34 },
      { x: 108, y: 49 },
      { x: 116, y: 66 },
      { x: 118, y: 82 },
      { x: 112, y: 97 },
      { x: 98, y: 110 },
      { x: 80, y: 117 },
      { x: 60, y: 120 },
      { x: 40, y: 117 },
      { x: 22, y: 110 },
      { x: 8, y: 97 },
      { x: 2, y: 82 },
      { x: 4, y: 66 },
      { x: 12, y: 49 },
      { x: 26, y: 34 },
      { x: 42, y: 24 },
      { x: 60, y: 20 },
    ]);
    expect(ellipse.kind).toBe("ellipse");

    const diamond = recognizeStroke([
      { x: 80, y: 0 },
      { x: 140, y: 60 },
      { x: 80, y: 120 },
      { x: 20, y: 60 },
      { x: 80, y: 0 },
    ]);
    expect(diamond.kind).toBe("diamond");
  });

  it("maintains at least 85% corpus accuracy for 6-shape set", () => {
    const corpus: CorpusCase[] = [
      {
        expected: "rect",
        points: [
          { x: 20, y: 20 },
          { x: 120, y: 20 },
          { x: 120, y: 90 },
          { x: 20, y: 90 },
          { x: 20, y: 20 },
        ],
      },
      {
        expected: "ellipse",
        points: [
          { x: 80, y: 20 },
          { x: 108, y: 36 },
          { x: 124, y: 72 },
          { x: 108, y: 108 },
          { x: 80, y: 124 },
          { x: 52, y: 108 },
          { x: 36, y: 72 },
          { x: 52, y: 36 },
          { x: 80, y: 20 },
        ],
      },
      {
        expected: "diamond",
        points: [
          { x: 90, y: 10 },
          { x: 150, y: 70 },
          { x: 90, y: 130 },
          { x: 30, y: 70 },
          { x: 90, y: 10 },
        ],
      },
      {
        expected: "triangle",
        points: [
          { x: 80, y: 20 },
          { x: 140, y: 120 },
          { x: 20, y: 120 },
          { x: 80, y: 20 },
        ],
      },
      {
        expected: "line",
        points: [
          { x: 0, y: 40 },
          { x: 40, y: 42 },
          { x: 80, y: 39 },
          { x: 120, y: 41 },
          { x: 170, y: 40 },
        ],
      },
      {
        expected: "text",
        points: [
          { x: 10, y: 80 },
          { x: 30, y: 68 },
          { x: 52, y: 82 },
          { x: 74, y: 67 },
          { x: 96, y: 81 },
          { x: 118, y: 70 },
          { x: 138, y: 80 },
        ],
      },
      {
        expected: "line",
        points: [
          { x: 10, y: 160 },
          { x: 60, y: 161 },
          { x: 100, y: 159 },
          { x: 140, y: 160 },
          { x: 190, y: 161 },
        ],
      },
    ];

    const correct = corpus.filter(
      (sample) => recognizeStroke(sample.points).kind === sample.expected,
    ).length;
    const accuracy = correct / corpus.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
