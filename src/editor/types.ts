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
  layer?: number;
  groupId?: string;
  connector?: {
    fromId: string;
    toId: string;
  };
  portOffsets?: Array<{
    id: "top" | "right" | "bottom" | "left";
    x: number;
    y: number;
  }>;
};

export type DiagramDocument = {
  version: string;
  elements: DiagramElement[];
  settings?: {
    title?: string;
    background?: string;
    canvas?: {
      width?: number;
      height?: number;
    };
  };
  metadata?: {
    schemaVersion: string;
    updatedAt: string;
    profileId?: string;
  };
};

export type DiagramProfile = {
  id: string;
  name: string;
  libraries: string[];
  actionPriority: Array<
    "convert" | "style" | "duplicate" | "delete" | "group" | "ungroup"
  >;
};

export type Point = { x: number; y: number };

export type GestureStroke = {
  id: string;
  points: Point[];
};
