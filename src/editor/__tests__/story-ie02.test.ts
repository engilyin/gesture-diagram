import { createDocument } from "../document";
import { createRectangle } from "../shapes";
import { resolvePdfExportDimensions } from "../export/pdf";

describe("STORY-IE02 PDF export dimensions", () => {
  it("uses document canvas hints when present", () => {
    const document = createDocument();
    document.settings = {
      title: "Hinted",
      background: "#fff",
      canvas: { width: 1024, height: 768 },
    };

    expect(resolvePdfExportDimensions(document)).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("frames diagram content when canvas hint is absent", () => {
    const document = createDocument();
    document.elements = [
      createRectangle(80, 120, 320, 200),
      createRectangle(520, 480, 180, 120),
    ];

    const dimensions = resolvePdfExportDimensions(document);
    expect(dimensions.width).toBeGreaterThanOrEqual(620);
    expect(dimensions.height).toBeGreaterThanOrEqual(528);
  });
});
