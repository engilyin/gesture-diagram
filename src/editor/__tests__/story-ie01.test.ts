import { importMermaid } from "../import/mermaid";

describe("STORY-IE01 Mermaid sequence import", () => {
  it("imports sequenceDiagram participants and messages with row/vertical layout", () => {
    const source = `
      sequenceDiagram
      participant Alice
      participant Bob
      participant Carol
      Alice->>Bob: Hello Bob
      Bob-->>Carol: Ping
      Carol->>Alice: Ack
    `;

    const result = importMermaid(source);
    const actors = result.document.elements.filter(
      (element) => /^mermaid-seq-actor-\d+$/.test(element.id) && element.kind === "rect",
    );
    const messages = result.document.elements.filter(
      (element) => /^mermaid-seq-msg-\d+$/.test(element.id),
    );

    expect(actors).toHaveLength(3);
    expect(messages).toHaveLength(3);

    expect(actors[1]?.x).toBeGreaterThan(actors[0]?.x ?? 0);
    expect(actors[2]?.x).toBeGreaterThan(actors[1]?.x ?? 0);
    expect(messages[1]?.y).toBeGreaterThan(messages[0]?.y ?? 0);
    expect(messages[2]?.y).toBeGreaterThan(messages[1]?.y ?? 0);

    expect(messages.every((message) => Boolean(message.connector?.fromId))).toBe(true);
    expect(messages.every((message) => Boolean(message.connector?.toId))).toBe(true);
  });
});
