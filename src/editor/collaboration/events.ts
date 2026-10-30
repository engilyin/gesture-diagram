import type { DiagramDocument } from "../types";

export const COLLABORATION_EVENT_VERSION = "1.0.0";

export type CollaborationEventType =
  | "document.changed"
  | "adapter.connected"
  | "adapter.disconnected"
  | "adapter.error";

export type CollaborationEventEnvelope<
  TType extends CollaborationEventType,
  TPayload,
> = {
  version: typeof COLLABORATION_EVENT_VERSION;
  type: TType;
  timestamp: string;
  payload: TPayload;
};

export type DiagramSyncEvent = CollaborationEventEnvelope<
  "document.changed",
  {
    source: "local" | "remote";
    document: DiagramDocument;
    previousDocument?: DiagramDocument;
  }
>;

export type CollaborationLifecycleEvent = CollaborationEventEnvelope<
  "adapter.connected" | "adapter.disconnected" | "adapter.error",
  {
    adapterId: string;
    reason?: string;
  }
>;

export function createDocumentChangeEvent(
  source: "local" | "remote",
  document: DiagramDocument,
  previousDocument?: DiagramDocument,
): DiagramSyncEvent {
  return {
    version: COLLABORATION_EVENT_VERSION,
    type: "document.changed",
    timestamp: new Date().toISOString(),
    payload: {
      source,
      document: saveEventDocument(document),
      previousDocument: previousDocument
        ? saveEventDocument(previousDocument)
        : undefined,
    },
  };
}

function saveEventDocument(document: DiagramDocument): DiagramDocument {
  return {
    version: document.version,
    elements: [...document.elements],
    metadata: document.metadata ? { ...document.metadata } : undefined,
  };
}
