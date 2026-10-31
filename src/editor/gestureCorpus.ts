export type GestureCorpusKind =
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "line"
  | "text";

export type GestureCorpusSample = {
  expected: GestureCorpusKind;
  points: Array<{ x: number; y: number }>;
};

const baseShapes: Record<GestureCorpusKind, Array<{ x: number; y: number }>> = {
  rect: [
    { x: 20, y: 20 },
    { x: 120, y: 20 },
    { x: 120, y: 90 },
    { x: 20, y: 90 },
    { x: 20, y: 20 },
  ],
  ellipse: [
    { x: 60, y: 20 },
    { x: 78, y: 24 },
    { x: 94, y: 34 },
    { x: 108, y: 49 },
    { x: 116, y: 66 },
    { x: 118, y: 82 },
    { x: 112, y: 97 },
    { x: 98, y: 110 },
    { x: 80, y: 117 },
    { x: 60, y: 120 },
    { x: 40, y: 117 },
    { x: 22, y: 110 },
    { x: 8, y: 97 },
    { x: 2, y: 82 },
    { x: 4, y: 66 },
    { x: 12, y: 49 },
    { x: 26, y: 34 },
    { x: 42, y: 24 },
    { x: 60, y: 20 },
  ],
  diamond: [
    { x: 90, y: 10 },
    { x: 150, y: 70 },
    { x: 90, y: 130 },
    { x: 30, y: 70 },
    { x: 90, y: 10 },
  ],
  triangle: [
    { x: 80, y: 20 },
    { x: 140, y: 120 },
    { x: 20, y: 120 },
    { x: 80, y: 20 },
  ],
  line: [
    { x: 0, y: 40 },
    { x: 40, y: 42 },
    { x: 80, y: 39 },
    { x: 120, y: 41 },
    { x: 170, y: 40 },
  ],
  text: [
    { x: 10, y: 80 },
    { x: 24, y: 58 },
    { x: 38, y: 84 },
    { x: 52, y: 56 },
    { x: 66, y: 86 },
    { x: 80, y: 60 },
    { x: 94, y: 85 },
    { x: 108, y: 57 },
    { x: 122, y: 84 },
    { x: 136, y: 59 },
    { x: 150, y: 83 },
    { x: 164, y: 61 },
    { x: 178, y: 82 },
  ],
};

function createVariant(
  points: Array<{ x: number; y: number }>,
  kind: GestureCorpusKind,
  index: number,
): Array<{ x: number; y: number }> {
  const scale =
    kind === "text" || kind === "line" ? 1 : 0.9 + (index % 5) * 0.05;
  const dx = (index % 10) * 5;
  const dy = Math.floor(index / 10) * 4;
  const jitterX =
    kind === "text" || kind === "line" ? 0 : (index % 3) - 1;
  const jitterY =
    kind === "text" || kind === "line" ? 0 : ((index + 1) % 3) - 1;

  return points.map((point, pointIndex) => ({
    x: Math.round(point.x * scale + dx + jitterX * (pointIndex % 2 === 0 ? 1 : 0)),
    y: Math.round(point.y * scale + dy + jitterY * (pointIndex % 2 === 1 ? 1 : 0)),
  }));
}

function buildSamplesForKind(kind: GestureCorpusKind, count: number): GestureCorpusSample[] {
  const template = baseShapes[kind];
  return Array.from({ length: count }, (_, index) => ({
    expected: kind,
    points: createVariant(template, kind, index),
  }));
}

export const gestureCorpus: GestureCorpusSample[] = (
  Object.keys(baseShapes) as GestureCorpusKind[]
).flatMap((kind) => buildSamplesForKind(kind, 50));
