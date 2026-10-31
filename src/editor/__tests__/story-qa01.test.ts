import { createRectangle } from "../shapes";
import { runPanZoomBenchmark } from "../performance";
import type { DiagramElement } from "../types";

function createBenchmarkScene(total: number): DiagramElement[] {
  const elements: DiagramElement[] = [];
  const columns = 100;
  const spacingX = 40;
  const spacingY = 34;

  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const shape = createRectangle(
      24 + column * spacingX,
      24 + row * spacingY,
      28,
      20,
    );
    shape.id = `perf-${index}`;
    elements.push(shape);
  }
  return elements;
}

describe("STORY-QA01 pan/zoom benchmark", () => {
  it("measures pan/zoom throughput on a 5k-element scene", () => {
    const elements = createBenchmarkScene(5000);
    const result = runPanZoomBenchmark(elements, {
      viewport: { width: 1200, height: 800 },
      frames: 240,
    });

    expect(result.frames).toBe(240);
    expect(result.totalVisibleSamples).toBeGreaterThan(0);
    expect(result.averageFrameMs).toBeLessThan(50);
    expect(result.fps).toBeGreaterThan(20);
  });
});
