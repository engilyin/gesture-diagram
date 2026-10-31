export type DiagramElement = {
  id: string;
  kind: "rect" | "ellipse" | "diamond" | "triangle" | "line" | "ink" | "text" | "container";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  textAlignHorizontal?: "left" | "center" | "right";
  textAlignVertical?: "top" | "middle" | "bottom";
  textOverflowMode?: "grow-shape" | "shrink-text";
  locked?: boolean;
  hidden?: boolean;
  color?: string;
  strokeWidth?: number;
  styleVariant?: "filled" | "outlined" | "dashed";
  rotation?: number;
  points?: Point[];
  layer?: number;
  groupId?: string;
  parentId?: string;
  containerLayoutMode?: "free" | "row" | "column" | "grid";
  collapsed?: boolean;
  connector?: {
    fromId: string;
    toId: string;
  };
  connectorRouting?: "straight" | "orthogonal" | "curved";
  portOffsets?: Array<{
    id: "top" | "right" | "bottom" | "left";
    x: number;
    y: number;
  }>;
};

export type DiagramLayer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
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
    layers?: DiagramLayer[];
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
