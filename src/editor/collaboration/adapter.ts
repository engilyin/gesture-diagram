import type { DiagramDocument } from "../types";
import type { CollaborationLifecycleEvent, DiagramSyncEvent } from "./events";

export type CollaborationAdapterHooks = {
  onRemoteDocument?: (document: DiagramDocument) => void;
  onDocumentChange?: (event: DiagramSyncEvent) => void;
  onLifecycleEvent?: (event: CollaborationLifecycleEvent) => void;
};

export type CollaborationAdapterError = {
  code: "connect_failed" | "disconnect_failed" | "sync_failed";
  message: string;
  cause?: unknown;
};

export interface CollaborationAdapter {
  readonly id: string;
  connect(hooks: CollaborationAdapterHooks): Promise<void>;
  disconnect(): Promise<void>;
  publish?(event: DiagramSyncEvent): Promise<void>;
  applyRemote?(document: DiagramDocument): Promise<void>;
}
