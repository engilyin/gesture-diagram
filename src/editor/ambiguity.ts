import type { Point } from "./types";

export type GestureCandidate = "rect" | "line" | "ink";

export type AmbiguityDecision = {
  kind: GestureCandidate;
  confidence: number;
  alternatives: Array<{ kind: GestureCandidate; confidence: number }>;
};

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function scoreRectangle(points: Point[]): number {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  if (width < 20 || height < 20) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const closeDistance = pointDistance(start, end);
  const closureScore = Math.max(0, 1 - closeDistance / Math.max(width, height));
  const perimeter = 2 * (width + height);

  const pathLength = points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    return total + pointDistance(points[index - 1], point);
  }, 0);

  if (pathLength === 0 || perimeter === 0) {
    return 0;
  }

  const perimeterScore =
    1 - Math.min(Math.abs(pathLength - perimeter) / perimeter, 1);
  const ratioScore = Math.min(width, height) / Math.max(width, height);

  return 0.45 * closureScore + 0.35 * perimeterScore + 0.2 * ratioScore;
}

function scoreLine(points: Point[]): number {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const start = points[0];
  const end = points[points.length - 1];

  const pathLength = points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    return total + pointDistance(points[index - 1], point);
  }, 0);

  if (pathLength === 0) {
    return 0;
  }

  const straightness = pointDistance(start, end) / pathLength;
  const elongated = Math.max(width, height) / (Math.min(width, height) + 1);
  const elongatedScore = Math.min((elongated - 1) / 4, 1);
  const closurePenalty = pointDistance(start, end) < 12 ? 0.5 : 1;

  return (0.6 * straightness + 0.4 * elongatedScore) * closurePenalty;
}

export function evaluateAmbiguity(points: Point[]): AmbiguityDecision {
  if (points.length < 3) {
    return {
      kind: "ink",
      confidence: 0.2,
      alternatives: [],
    };
  }

  const rectScore = scoreRectangle(points);
  const lineScore = scoreLine(points);
  const ranked = [
    { kind: "rect" as const, confidence: Number(rectScore.toFixed(2)) },
    { kind: "line" as const, confidence: Number(lineScore.toFixed(2)) },
    {
      kind: "ink" as const,
      confidence: Number(
        (0.5 + (1 - Math.max(rectScore, lineScore)) * 0.4).toFixed(2),
      ),
    },
  ].sort((a, b) => b.confidence - a.confidence);

  const best =
    ranked.find((candidate) => candidate.kind !== "ink") ??
    ranked[0] ?? { kind: "ink" as const, confidence: 0 };
  return {
    kind: best.kind,
    confidence: best.confidence,
    alternatives: ranked.filter((candidate) => candidate.kind !== best.kind),
  };
}
