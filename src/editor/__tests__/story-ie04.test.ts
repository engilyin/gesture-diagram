import { describe, expect, it } from "vitest";
import { exportDrawIo } from "../export/drawio";
import { importDrawIo } from "../import/drawio";

type NormalizedDocument = {
  nodes: Array<{ id: string; kind: string; parentId?: string; groupId?: string; layer?: number }>;
  edges: Array<{ id: string; fromId: string; toId: string; layer?: number }>;
};

function normalizeForRoundTrip(source: ReturnType<typeof importDrawIo>["document"]): NormalizedDocument {
  return {
    nodes: source.elements
      .filter((element) => element.kind !== "line")
      .map((element) => ({
        id: element.id,
        kind: element.kind,
        parentId: element.parentId,
        groupId: element.groupId,
        layer: element.layer,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: source.elements
      .filter((element) => element.kind === "line" && element.connector)
      .map((element) => ({
        id: element.id,
        fromId: element.connector?.fromId ?? "",
        toId: element.connector?.toId ?? "",
        layer: element.layer,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

describe("STORY-IE04 draw.io export", () => {
  it("exports valid draw.io XML", () => {
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
    const imported = importDrawIo(source);
    const xml = exportDrawIo(imported.document);
    expect(xml).toContain("<mxfile");
    expect(xml).toContain("<diagram");
    expect(xml).toContain("<mxGraphModel");
    expect(xml).toContain('edge="1"');
    expect(() => importDrawIo(xml)).not.toThrow();
  });

  it("round-trips imported draw.io corpus with semantic equivalence", () => {
    const corpus = [
      `
        <mxfile>
          <diagram>
            <mxGraphModel>
              <root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                <mxCell id="2" vertex="1" parent="1">
                  <mxGeometry x="20" y="30" width="120" height="80" as="geometry"/>
                </mxCell>
                <mxCell id="3" vertex="1" parent="1">
                  <mxGeometry x="240" y="40" width="120" height="80" as="geometry"/>
                </mxCell>
                <mxCell id="4" edge="1" parent="1" source="2" target="3">
                  <mxGeometry relative="1" as="geometry"/>
                </mxCell>
              </root>
            </mxGraphModel>
          </diagram>
        </mxfile>
      `,
      `
        <mxfile>
          <diagram>
            <mxGraphModel>
              <root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                <mxCell id="g1" vertex="1" parent="1" style="group=1;">
                  <mxGeometry x="40" y="50" width="340" height="220" as="geometry"/>
                </mxCell>
                <mxCell id="a1" vertex="1" parent="g1">
                  <mxGeometry x="80" y="110" width="120" height="60" as="geometry"/>
                </mxCell>
                <mxCell id="b1" vertex="1" parent="1">
                  <mxGeometry x="460" y="120" width="120" height="70" as="geometry"/>
                </mxCell>
                <mxCell id="e1" edge="1" parent="1" source="a1" target="b1">
                  <mxGeometry relative="1" as="geometry"/>
                </mxCell>
              </root>
            </mxGraphModel>
          </diagram>
        </mxfile>
      `,
    ];

    corpus.forEach((source) => {
      const imported = importDrawIo(source).document;
      const exported = exportDrawIo(imported);
      const reparsed = importDrawIo(exported).document;
      expect(normalizeForRoundTrip(reparsed)).toEqual(
        normalizeForRoundTrip(imported),
      );
    });
  });
});
