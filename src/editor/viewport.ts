export type ViewState = {
  x: number;
  y: number;
  scale: number;
};

export type ViewBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 0.2), 2.5);
}

export function createViewState(): ViewState {
  return { x: 0, y: 0, scale: 1 };
}

export function getViewBounds(
  view: ViewState,
  viewportWidth: number,
  viewportHeight: number,
  padding = 160,
): ViewBounds {
  const worldMinX = (0 - view.x) / view.scale;
  const worldMinY = (0 - view.y) / view.scale;
  const worldMaxX = (viewportWidth - view.x) / view.scale;
  const worldMaxY = (viewportHeight - view.y) / view.scale;

  return {
    minX: worldMinX - padding,
    minY: worldMinY - padding,
    maxX: worldMaxX + padding,
    maxY: worldMaxY + padding,
  };
}
