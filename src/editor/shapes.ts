import type { DiagramElement } from './types';

export function createRectangle(x: number, y: number, width: number, height: number): DiagramElement {
  return {
    id: crypto.randomUUID(),
    kind: 'rect',
    x,
    y,
    width,
    height,
    color: '#4f46e5',
  };
}

export function createLine(x: number, y: number, width: number, height: number): DiagramElement {
  return {
    id: crypto.randomUUID(),
    kind: 'line',
    x,
    y,
    width,
    height,
    color: '#0f172a',
  };
}
