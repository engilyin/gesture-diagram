import {
  EMBED_CHANNEL,
  createOutgoingEmbedMessage,
  isIncomingEmbedMessage,
} from "../postMessageProtocol";

describe("STORY-EMB02 postMessage protocol guards", () => {
  it("accepts valid host commands", () => {
    expect(
      isIncomingEmbedMessage({ channel: EMBED_CHANNEL, type: "ping" }),
    ).toBeTruthy();
    expect(
      isIncomingEmbedMessage({ channel: EMBED_CHANNEL, type: "get-document" }),
    ).toBeTruthy();
    expect(
      isIncomingEmbedMessage({
        channel: EMBED_CHANNEL,
        type: "set-document",
        document: {
          version: "1.1.0",
          metadata: {
            schemaVersion: "v1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          elements: [],
        },
      }),
    ).toBeTruthy();
  });

  it("rejects malformed messages", () => {
    expect(isIncomingEmbedMessage(null)).toBeFalsy();
    expect(
      isIncomingEmbedMessage({ channel: EMBED_CHANNEL, type: "set-document" }),
    ).toBeFalsy();
    expect(
      isIncomingEmbedMessage({ channel: "other", type: "ping" }),
    ).toBeFalsy();
    expect(
      isIncomingEmbedMessage({ channel: EMBED_CHANNEL, type: "unknown" }),
    ).toBeFalsy();
  });

  it("creates channel-tagged outgoing messages", () => {
    expect(createOutgoingEmbedMessage({ type: "ready" })).toEqual({
      channel: EMBED_CHANNEL,
      type: "ready",
    });
    expect(
      createOutgoingEmbedMessage({
        type: "document",
        requestId: "req-3",
        document: {
          version: "1.1.0",
          metadata: {
            schemaVersion: "v1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          elements: [],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        channel: EMBED_CHANNEL,
        type: "document",
        requestId: "req-3",
      }),
    );
  });
});
