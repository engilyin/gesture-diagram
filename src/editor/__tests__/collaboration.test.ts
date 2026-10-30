import { describe, expect, it, vi } from "vitest";
import { createDocument, createDocumentChangeDispatcher } from "../document";
import {
  COLLABORATION_EVENT_VERSION,
  createDocumentChangeEvent,
} from "../collaboration/events";

describe("collaboration boundaries", () => {
  it("creates versioned document change events", () => {
    const current = createDocument();
    const previous = createDocument();
    previous.version = "0.0.9";

    const event = createDocumentChangeEvent("local", current, previous);
    expect(event.version).toBe(COLLABORATION_EVENT_VERSION);
    expect(event.type).toBe("document.changed");
    expect(event.payload.source).toBe("local");
    expect(event.payload.document).toEqual(current);
    expect(event.payload.previousDocument).toEqual(previous);
  });

  it("notifies subscribers through a collaboration-safe dispatcher", () => {
    const dispatcher = createDocumentChangeDispatcher();
    const listener = vi.fn();
    const unsubscribe = dispatcher.subscribe(listener);

    const firstDocument = createDocument();
    const firstEvent = dispatcher.notify("local", firstDocument);
    expect(listener).toHaveBeenCalledWith(firstEvent);

    unsubscribe();

    const secondDocument = createDocument();
    dispatcher.notify("remote", secondDocument, firstDocument);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
