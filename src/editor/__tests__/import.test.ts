import { describe, expect, it } from "vitest";
import { importDrawIo } from "../import/drawio";
import { importMermaid } from "../import/mermaid";

describe("import adapters", () => {
  it("imports draw.io shapes and edges into canonical elements", () => {
    const source = `
      <mxfile>
        <diagram>
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="2" vertex="1" parent="1">
                <mxGeometry x="10" y="20" width="120" height="80" as="geometry"/>
              </mxCell>
              <mxCell id="3" vertex="1" parent="1">
                <mxGeometry x="260" y="30" width="120" height="80" as="geometry"/>
              </mxCell>
              <mxCell id="4" edge="1" parent="1" source="2" target="3">
                <mxGeometry relative="1" as="geometry"/>
              </mxCell>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>
    `;

    const result = importDrawIo(source);
    expect(result.document.elements.length).toBe(3);
    expect(result.document.elements.some((item) => item.kind === "line")).toBe(
      true,
    );
  });

  it("imports mermaid flowchart into nodes and connectors", () => {
    const source = `
      flowchart LR
      A --> B
      B --> C
    `;

    const result = importMermaid(source);
    expect(result.document.elements.some((item) => item.kind === "rect")).toBe(
      true,
    );
    expect(result.document.elements.some((item) => item.kind === "line")).toBe(
      true,
    );
  });

  it("fails fast on malformed drawio documents", () => {
    expect(() => importDrawIo("<mxfile><diagram>")).toThrow(
      "draw.io import failed",
    );
  });
});
