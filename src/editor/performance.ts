import { getVisibleElements } from "./culling";
import type { DiagramElement } from "./types";
import type { ViewState } from "./viewport";

type BenchmarkOptions = {
  viewport: {
    width: number;
    height: number;
  };
  frames?: number;
};

export type PanZoomBenchmarkResult = {
  frames: number;
  totalVisibleSamples: number;
  elapsedMs: number;
  averageFrameMs: number;
  fps: number;
};

export function runPanZoomBenchmark(
  elements: DiagramElement[],
  options: BenchmarkOptions,
): PanZoomBenchmarkResult {
  const frames = Math.max(1, options.frames ?? 240);
  const start = performance.now();
  let totalVisibleSamples = 0;

  for (let index = 0; index < frames; index += 1) {
    const view: ViewState = {
      x: -index * 4,
      y: -index * 3,
      scale: 0.7 + (index % 12) * 0.05,
    };
    const visible = getVisibleElements(elements, view, options.viewport);
    totalVisibleSamples += visible.length;
  }

  const elapsedMs = Math.max(performance.now() - start, 0.1);
  const averageFrameMs = elapsedMs / frames;
  const fps = 1000 / averageFrameMs;

  return {
    frames,
    totalVisibleSamples,
    elapsedMs,
    averageFrameMs,
    fps,
  };
}
