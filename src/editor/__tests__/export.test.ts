import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "../document";
import { createRectangle } from "../shapes";
import { exportSvg } from "../export/svg";
import { exportPng } from "../export/png";

describe("export adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exports valid svg content with diagram primitives", () => {
    const document = createDocument();
    document.elements.push(createRectangle(20, 30, 140, 70));

    const result = exportSvg(document);
    expect(result.content).toContain("<svg");
    expect(result.content).toContain("<rect");
    expect(result.warnings).toEqual([]);
  });

  it("exports png blob", async () => {
    const document = createDocument();
    document.elements.push(createRectangle(20, 30, 140, 70));

    const toBlob = vi.fn((cb: BlobCallback) =>
      cb(new Blob(["png"], { type: "image/png" })),
    );
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    vi.spyOn(window.document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ clearRect, drawImage }),
      toBlob,
    } as unknown as HTMLCanvasElement);

    class MockImage {
      decoding = "sync";
      src = "";
      decode = vi.fn(async () => undefined);
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });

    const blob = await exportPng(document);
    expect(blob.type).toBe("image/png");
  });
});
