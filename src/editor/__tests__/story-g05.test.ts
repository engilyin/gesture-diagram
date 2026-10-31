import { describe, expect, it } from "vitest";
import { gestureCorpus } from "../gestureCorpus";
import { recognizeStroke } from "../recognition";

describe("STORY-G05 gesture corpus harness", () => {
  it("contains at least 50 labeled samples per core shape kind", () => {
    const counts = gestureCorpus.reduce<Record<string, number>>((acc, sample) => {
      acc[sample.expected] = (acc[sample.expected] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.rect).toBeGreaterThanOrEqual(50);
    expect(counts.ellipse).toBeGreaterThanOrEqual(50);
    expect(counts.diamond).toBeGreaterThanOrEqual(50);
    expect(counts.triangle).toBeGreaterThanOrEqual(50);
    expect(counts.line).toBeGreaterThanOrEqual(50);
    expect(counts.text).toBeGreaterThanOrEqual(50);
  });

  it("enforces at least 85% top-1 hit rate on the committed corpus", () => {
    const perKind = gestureCorpus.reduce<Record<string, { total: number; correct: number }>>(
      (acc, sample) => {
        const match = recognizeStroke(sample.points).kind === sample.expected;
        const bucket = acc[sample.expected] ?? { total: 0, correct: 0 };
        bucket.total += 1;
        bucket.correct += match ? 1 : 0;
        acc[sample.expected] = bucket;
        return acc;
      },
      {},
    );
    const correct = gestureCorpus.filter(
      (sample) => recognizeStroke(sample.points).kind === sample.expected,
    ).length;
    const accuracy = correct / gestureCorpus.length;

    expect(accuracy, JSON.stringify(perKind)).toBeGreaterThanOrEqual(0.85);
  });
});
