import { deserializeDocument, serializeDocument } from "../persistence/yamlCodec";
import type { DiagramDocument } from "../types";

describe("STORY-LY01 YAML persistence", () => {
  it("round-trips layer settings and element layer assignment", () => {
    const document: DiagramDocument = {
      version: "0.1.0",
      elements: [
        {
          id: "shape-a",
          kind: "rect",
          x: 40,
          y: 50,
          width: 120,
          height: 70,
          layer: 1,
        },
      ],
      settings: {
        title: "Layered",
        layers: [
          { id: "l1", name: "Background", color: "#94a3b8", visible: true, locked: true },
          { id: "l2", name: "Content", color: "#4f46e5", visible: true, locked: false },
        ],
      },
    };

    const yaml = serializeDocument(document, "2026-01-01T00:00:00.000Z");
    const parsed = deserializeDocument(yaml);
    expect(parsed.settings?.layers).toEqual(document.settings?.layers);
    expect(parsed.elements[0]?.layer).toBe(1);
  });
});
