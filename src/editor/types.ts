export type DiagramElement = {
  id: string;
  kind: "rect" | "line" | "ink" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  points?: Point[];
};

export type DiagramDocument = {
  version: string;
  elements: DiagramElement[];
};

export type Point = { x: number; y: number };

export type GestureStroke = {
  id: string;
  points: Point[];
};
