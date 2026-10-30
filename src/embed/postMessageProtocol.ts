import type { DiagramDocument } from "../editor/types";
import type {
  GestureDiagramIncomingMessage,
  GestureDiagramOutgoingMessage,
} from "./types";

export const EMBED_CHANNEL = "gesture-diagram";

export function isIncomingEmbedMessage(
  input: unknown,
): input is GestureDiagramIncomingMessage {
  if (!input || typeof input !== "object") {
    return false;
  }
  const candidate = input as Partial<GestureDiagramIncomingMessage>;
  if (candidate.channel !== EMBED_CHANNEL || typeof candidate.type !== "string") {
    return false;
  }

  if (candidate.type === "set-document") {
    const document = (candidate as { document?: unknown }).document;
    if (!document || typeof document !== "object") {
      return false;
    }
    const asDocument = document as Partial<DiagramDocument>;
    return typeof asDocument.version === "string" && Array.isArray(asDocument.elements);
  }

  return (
    candidate.type === "ping" ||
    candidate.type === "get-document" ||
    candidate.type === "clear"
  );
}

export function createOutgoingEmbedMessage(
  message: (
    | { type: "ready" | "pong" | "cleared"; requestId?: string }
    | {
        type: "change" | "document";
        requestId?: string;
        document: DiagramDocument;
      }
    | { type: "error"; requestId?: string; message: string }
  ),
): GestureDiagramOutgoingMessage {
  return {
    channel: EMBED_CHANNEL,
    ...message,
  };
}
