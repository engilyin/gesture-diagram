import { clampScale, type ViewState } from './viewport';

export function panView(view: ViewState, deltaX: number, deltaY: number): ViewState {
  return {
    ...view,
    x: view.x + deltaX,
    y: view.y + deltaY,
  };
}

export function zoomByDelta(view: ViewState, deltaY: number): ViewState {
  const direction = deltaY > 0 ? -0.1 : 0.1;
  return {
    ...view,
    scale: clampScale(view.scale * (1 + direction)),
  };
}
