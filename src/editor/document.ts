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
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };
}

export function saveDocument(document: DiagramDocument): DiagramDocument {
  return {
    version: document.version,
    elements: [...document.elements],
    metadata: document.metadata ? { ...document.metadata } : undefined,
  };
}

export function createDocumentFromElements(
  elements: DiagramElement[],
  version = "0.1.0",
): DiagramDocument {
  return {
    version,
    elements: [...elements],
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
