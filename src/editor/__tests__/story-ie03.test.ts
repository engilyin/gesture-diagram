import { deflateRaw } from "pako";
import { importDrawIo } from "../import/drawio";

function compressDiagramXml(mxGraphModelXml: string): string {
  const encoded = encodeURIComponent(mxGraphModelXml);
  const compressed = deflateRaw(encoded);
  const binary = Array.from(compressed, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

describe("STORY-IE03 draw.io import fidelity", () => {
  it("imports compressed draw.io layers and maps groups/containers", () => {
    const diagramLayer0 = `
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
        </root>
      </mxGraphModel>
    `;
    const diagramLayer1 = `
      <mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="n1" vertex="1" parent="1">
            <mxGeometry x="480" y="110" width="120" height="70" as="geometry"/>
          </mxCell>
        </root>
      </mxGraphModel>
    `;

    const source = `
      <mxfile>
        <diagram id="layer-1">${compressDiagramXml(diagramLayer0)}</diagram>
        <diagram id="layer-2">${compressDiagramXml(diagramLayer1)}</diagram>
      </mxfile>
    `;

    const result = importDrawIo(source);
    const container = result.document.elements.find((item) => item.id === "drawio-g1");
    const child = result.document.elements.find((item) => item.id === "drawio-a1");
    const secondLayerNode = result.document.elements.find((item) => item.id === "drawio-n1");

    expect(container?.kind).toBe("container");
    expect(child?.parentId).toBe("drawio-g1");
    expect(container?.layer).toBe(0);
    expect(secondLayerNode?.layer).toBe(1);
  });
});
