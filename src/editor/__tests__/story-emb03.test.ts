import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../document";
import { createRectangle } from "../shapes";
import { exportPngHeadless, exportSvgHeadless } from "../export/headless";

describe("STORY-EMB03 headless export", () => {
  it("exports SVG content with requested dimensions", () => {
    const document = createDocument();
    document.elements.push(createRectangle(20, 30, 140, 70));

    const result = exportSvgHeadless(document, { width: 640, height: 360 });
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
    expect(result.content).toContain('width="640"');
    expect(result.content).toContain('height="360"');
    expect(result.content).toContain("<rect");
  });

  it("exports PNG bytes via injected renderer", async () => {
    const document = createDocument();
    document.elements.push(createRectangle(5, 5, 80, 40));
    const renderPng = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));

    const bytes = await exportPngHeadless(document, {
      width: 320,
      height: 200,
      background: "#ffffff",
      renderPng,
    });

    expect(bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(renderPng).toHaveBeenCalledWith(
      expect.stringContaining("<svg"),
      {
        width: 320,
        height: 200,
        background: "#ffffff",
      },
    );
  });

  it("fails clearly when renderer returns unsupported output", async () => {
    const document = createDocument();

    await expect(
      exportPngHeadless(document, {
        renderPng: async () => ({}) as unknown as Uint8Array,
      }),
    ).rejects.toThrow(
      "Headless PNG export failed: renderer must return Uint8Array or ArrayBuffer.",
    );
  });
});
