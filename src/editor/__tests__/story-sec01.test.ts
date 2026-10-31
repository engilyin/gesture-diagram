import { importDrawIo } from "../import/drawio";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

describe("STORY-SEC01 import hardening", () => {
  it("rejects XML entity expansion beyond safe limits", () => {
    const repeatedReference = "&e;".repeat(200);
    const source = `<!DOCTYPE mxfile [
      <!ENTITY a "1234567890">
      <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
      <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
      <!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
      <!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;">
    ]>
    <mxfile>
      <diagram>
        <mxGraphModel>
          <root>
            <mxCell id="0"/>
            <mxCell id="1" parent="0"/>
            <mxCell id="2" value="${repeatedReference}" vertex="1" parent="1">
              <mxGeometry x="10" y="20" width="120" height="80" as="geometry"/>
            </mxCell>
          </root>
        </mxGraphModel>
      </diagram>
    </mxfile>`;

    expect(() => importDrawIo(source)).toThrow("XML entity expansion exceeds safe limit");
  });

  it("rejects compressed draw.io payloads larger than 10 MB before decompression", () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.fill(65);
    const source = `<mxfile><diagram>${toBase64(oversized)}</diagram></mxfile>`;

    expect(() => importDrawIo(source)).toThrow("compressed payload exceeds 10 MB limit");
  });

  it("rejects circular parent references in imported draw.io structures", () => {
    const source = `
      <mxfile>
        <diagram>
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="2" vertex="1" parent="3" style="shape=swimlane;">
                <mxGeometry x="20" y="20" width="220" height="140" as="geometry"/>
              </mxCell>
              <mxCell id="3" vertex="1" parent="2" style="shape=swimlane;">
                <mxGeometry x="40" y="40" width="140" height="80" as="geometry"/>
              </mxCell>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>
    `;

    expect(() => importDrawIo(source)).toThrow("circular parent references detected");
  });
});
