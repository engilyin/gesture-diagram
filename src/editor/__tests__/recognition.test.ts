import { describe, expect, it } from 'vitest';
import { recognizeStroke } from '../recognition';

describe('recognizeStroke', () => {
  it('recognizes a closed rectangle stroke', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 0, y: 80 },
      { x: 0, y: 0 },
    ];

    const result = recognizeStroke(points);
    expect(result.kind).toBe('rect');
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.element).toBeTruthy();
  });

  it('recognizes a connector-like straight stroke', () => {
    const points = [
      { x: 0, y: 40 },
      { x: 30, y: 42 },
      { x: 70, y: 38 },
      { x: 120, y: 41 },
      { x: 170, y: 40 },
    ];

    const result = recognizeStroke(points);
    expect(result.kind).toBe('line');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.element).toBeTruthy();
  });

  it('does not classify a long straight stroke as a rectangle when it is not closed', () => {
    const points = [
      { x: 0, y: 40 },
      { x: 30, y: 42 },
      { x: 70, y: 38 },
      { x: 120, y: 41 },
      { x: 170, y: 40 },
      { x: 220, y: 39 },
    ];

    const result = recognizeStroke(points);
    expect(result.kind).not.toBe('rect');
  });

  it('falls back to ink for short uncertain strokes', () => {
    const result = recognizeStroke([
      { x: 0, y: 0 },
      { x: 10, y: 12 },
      { x: 15, y: 16 },
    ]);

    expect(result.kind).toBe('ink');
  });

  it("recognizes a closed oval stroke as ellipse", () => {
    const points = [
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
    ];

    const result = recognizeStroke(points);
    expect(result.kind).toBe("ellipse");
    expect(result.element?.kind).toBe("ellipse");
  });

  it("recognizes a closed four-corner stroke as diamond", () => {
    const points = [
      { x: 80, y: 0 },
      { x: 140, y: 60 },
      { x: 80, y: 120 },
      { x: 20, y: 60 },
      { x: 80, y: 0 },
    ];

    const result = recognizeStroke(points);
    expect(result.kind).toBe("diamond");
    expect(result.element?.kind).toBe("diamond");
  });
});
