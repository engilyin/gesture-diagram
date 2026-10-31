export type DiagramElement = {
  id: string;
  kind: "rect" | "ellipse" | "diamond" | "triangle" | "line" | "ink" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  locked?: boolean;
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
    | "convert"
    | "style"
    | "duplicate"
    | "delete"
    | "group"
    | "ungroup"
    | "lock"
    | "unlock"
  >;
};

export type Point = { x: number; y: number };

export type GestureStroke = {
  id: string;
  points: Point[];
};
