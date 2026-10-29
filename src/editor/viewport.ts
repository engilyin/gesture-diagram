export type ViewState = {
  x: number;
  y: number;
  scale: number;
};

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 0.2), 2.5);
}

export function createViewState(): ViewState {
  return { x: 0, y: 0, scale: 1 };
}
