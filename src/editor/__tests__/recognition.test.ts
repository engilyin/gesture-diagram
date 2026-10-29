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

  it('falls back to ink for short uncertain strokes', () => {
    const result = recognizeStroke([
      { x: 0, y: 0 },
      { x: 10, y: 12 },
      { x: 15, y: 16 },
    ]);

    expect(result.kind).toBe('ink');
  });
});
