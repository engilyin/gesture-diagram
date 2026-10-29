export type DiagramElement = {
  id: string;
  kind: 'rect' | 'line' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
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
