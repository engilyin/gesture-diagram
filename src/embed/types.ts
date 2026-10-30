import type { DiagramDocument } from "../editor/types";

export type GestureDiagramConfig = {
  readOnly?: boolean;
};

export type GestureDiagramApi = {
  getDocument: () => DiagramDocument;
  setDocument: (document: DiagramDocument) => void;
  clear: () => void;
};

export type GestureDiagramChangeEvent = {
  document: DiagramDocument;
};
