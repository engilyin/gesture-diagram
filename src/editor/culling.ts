import type { DiagramElement } from "./types";
import type { ViewBounds, ViewState } from "./viewport";
import { getViewBounds } from "./viewport";

type ViewportSize = {
  width: number;
  height: number;
};

function intersectsBounds(
  element: DiagramElement,
  bounds: ViewBounds,
): boolean {
  const minX = element.x;
  const minY = element.y;
  const maxX = element.x + element.width;
  const maxY = element.y + element.height;

  return !(
    maxX < bounds.minX ||
    minX > bounds.maxX ||
    maxY < bounds.minY ||
    minY > bounds.maxY
  );
}

export function getVisibleElements(
  elements: DiagramElement[],
  view: ViewState,
  viewport: ViewportSize,
): DiagramElement[] {
  if (elements.length === 0) {
    return [];
  }

  const bounds = getViewBounds(view, viewport.width, viewport.height);
  return elements.filter((element) => intersectsBounds(element, bounds));
}
