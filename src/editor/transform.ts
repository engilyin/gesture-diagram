export type ResizeHandle = "nw" | "ne" | "se" | "sw";

export type TransformableElement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const minSize = 20;

export function moveElement(
  element: TransformableElement,
  dx: number,
  dy: number,
): TransformableElement {
  return {
    ...element,
    x: element.x + dx,
    y: element.y + dy,
  };
}

export function resizeElement(
  element: TransformableElement,
  dx: number,
  dy: number,
  handle: ResizeHandle,
): TransformableElement {
  switch (handle) {
    case "se":
      return {
        ...element,
        width: Math.max(minSize, element.width + dx),
        height: Math.max(minSize, element.height + dy),
      };
    case "ne": {
      const nextWidth = Math.max(minSize, element.width + dx);
      const nextHeight = Math.max(minSize, element.height - dy);
      const clampedDy = nextHeight === minSize ? element.height - minSize : dy;
      return {
        ...element,
        y: element.y + clampedDy,
        width: nextWidth,
        height: nextHeight,
      };
    }
    case "sw": {
      const nextWidth = Math.max(minSize, element.width - dx);
      const nextHeight = Math.max(minSize, element.height + dy);
      const clampedDx = nextWidth === minSize ? element.width - minSize : dx;
      return {
        ...element,
        x: element.x + clampedDx,
        width: nextWidth,
        height: nextHeight,
      };
    }
    case "nw": {
      const nextWidth = Math.max(minSize, element.width - dx);
      const nextHeight = Math.max(minSize, element.height - dy);
      const clampedDx = nextWidth === minSize ? element.width - minSize : dx;
      const clampedDy = nextHeight === minSize ? element.height - minSize : dy;
      return {
        ...element,
        x: element.x + clampedDx,
        y: element.y + clampedDy,
        width: nextWidth,
        height: nextHeight,
      };
    }
    default:
      return element;
  }
}
