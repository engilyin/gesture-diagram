import type { DiagramDocument } from "../editor/types";

export type GestureDiagramConfig = {
  readOnly?: boolean;
  profileId?: string;
  postMessage?: {
    enabled: boolean;
    targetOrigin?: string;
    allowedOrigins?: string[];
  };
};

export type GestureDiagramApi = {
  getDocument: () => DiagramDocument;
  setDocument: (document: DiagramDocument) => void;
  clear: () => void;
};

export type GestureDiagramChangeEvent = {
  document: DiagramDocument;
};

export type GestureDiagramMessageChannel = "gesture-diagram";

export type GestureDiagramIncomingMessage =
  | {
      channel: GestureDiagramMessageChannel;
      type: "ping";
      requestId?: string;
    }
  | {
      channel: GestureDiagramMessageChannel;
      type: "get-document";
      requestId?: string;
    }
  | {
      channel: GestureDiagramMessageChannel;
      type: "set-document";
      requestId?: string;
      document: DiagramDocument;
    }
  | {
      channel: GestureDiagramMessageChannel;
      type: "clear";
      requestId?: string;
    };

export type GestureDiagramOutgoingMessage =
  | {
      channel: GestureDiagramMessageChannel;
      type: "ready" | "pong" | "cleared";
      requestId?: string;
    }
  | {
      channel: GestureDiagramMessageChannel;
      type: "change" | "document";
      requestId?: string;
      document: DiagramDocument;
    }
  | {
      channel: GestureDiagramMessageChannel;
      type: "error";
      requestId?: string;
      message: string;
    };
