import type { DiagramDocument, DiagramElement } from "./types";
import {
  createDocumentChangeEvent,
  type DiagramSyncEvent,
} from "./collaboration/events";

export function createDocument(): DiagramDocument {
  return {
    version: "0.1.0",
    elements: [],
  };
}

export function loadDocument(input: DiagramDocument): DiagramDocument {
  return {
    version: input.version,
    elements: [...input.elements],
    settings: input.settings
      ? {
          ...input.settings,
          canvas: input.settings.canvas ? { ...input.settings.canvas } : undefined,
        }
      : undefined,
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };
}

export function saveDocument(document: DiagramDocument): DiagramDocument {
  return {
    version: document.version,
    elements: [...document.elements],
    settings: document.settings
      ? {
          ...document.settings,
          canvas: document.settings.canvas
            ? { ...document.settings.canvas }
            : undefined,
        }
      : undefined,
    metadata: document.metadata ? { ...document.metadata } : undefined,
  };
}

export function createDocumentFromElements(
  elements: DiagramElement[],
  version = "0.1.0",
  settings?: DiagramDocument["settings"],
): DiagramDocument {
  return {
    version,
    elements: [...elements],
    settings: settings
      ? {
          ...settings,
          canvas: settings.canvas ? { ...settings.canvas } : undefined,
        }
      : undefined,
  };
}

export function getDocumentElements(
  document: DiagramDocument,
): DiagramElement[] {
  return [...document.elements];
}

export type DocumentChangeSubscriber = (event: DiagramSyncEvent) => void;

export type DocumentChangeDispatcher = {
  subscribe: (subscriber: DocumentChangeSubscriber) => () => void;
  notify: (
    source: "local" | "remote",
    document: DiagramDocument,
    previousDocument?: DiagramDocument,
  ) => DiagramSyncEvent;
};

export function createDocumentChangeDispatcher(): DocumentChangeDispatcher {
  const subscribers = new Set<DocumentChangeSubscriber>();

  return {
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    notify(source, document, previousDocument) {
      const event = createDocumentChangeEvent(
        source,
        document,
        previousDocument,
      );
      subscribers.forEach((subscriber) => subscriber(event));
      return event;
    },
  };
}
