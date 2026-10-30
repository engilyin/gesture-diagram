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
});
