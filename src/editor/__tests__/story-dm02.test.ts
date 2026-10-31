import { describe, expect, it } from "vitest";
import { createOpsFromElementDiff } from "../ops";
import { assertValidPersistedDocument, toPersistedDocument } from "../schema";
import { createRectangle } from "../shapes";

describe("STORY-DM02 style token model support", () => {
  it("supports style token definitions in document settings schema", () => {
    const document = {
      version: "0.4.0",
      elements: [],
      settings: {
        styleTokens: [
          {
            id: "primary",
            name: "Primary",
            color: "#2563eb",
            fontSize: 18,
            strokeWidth: 3,
          },
        ],
      },
    };

    const persisted = toPersistedDocument(document, "2026-01-01T00:00:00.000Z");
    const parsed = assertValidPersistedDocument(persisted);
    expect(parsed.document.settings?.styleTokens?.[0]).toEqual({
      id: "primary",
      name: "Primary",
      color: "#2563eb",
      fontSize: 18,
      strokeWidth: 3,
    });
  });

  it("tracks styleTokenId assignments as serializable property ops", () => {
    const element = createRectangle(20, 20, 120, 80);
    const before = [element];
    const after = [{ ...element, styleTokenId: "primary" }];

    const ops = createOpsFromElementDiff(before, after, { nodeId: "node-a" });
    const tokenOp = ops.find(
      (op) => op.type === "set-property" && op.property === "styleTokenId",
    );

    expect(tokenOp).toBeTruthy();
    if (tokenOp?.type === "set-property") {
      expect(tokenOp.value).toBe("primary");
      expect(tokenOp.clock?.nodeId).toBe("node-a");
    }
  });
});
