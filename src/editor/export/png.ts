import type { DiagramDocument } from "../types";
import { exportSvg } from "./svg";

export async function exportPng(
  diagramDocument: DiagramDocument,
): Promise<Blob> {
  const { content } = exportSvg(diagramDocument);
  const svgBlob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = svgUrl;
    await image.decode();

    const canvas = window.document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("PNG export failed: canvas context unavailable");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error("PNG export failed: unable to encode image"));
          return;
        }
        resolve(result);
      }, "image/png");
    });

    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
