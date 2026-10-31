import { jsPDF } from "jspdf";
import type { DiagramDocument } from "../types";
import { exportSvg } from "./svg";

const DEFAULT_PDF_WIDTH = 1600;
const DEFAULT_PDF_HEIGHT = 1000;
const CONTENT_PADDING = 48;

export function resolvePdfExportDimensions(document: DiagramDocument): {
  width: number;
  height: number;
} {
  const hintedWidth = document.settings?.canvas?.width;
  const hintedHeight = document.settings?.canvas?.height;

  if (
    typeof hintedWidth === "number" &&
    hintedWidth > 0 &&
    typeof hintedHeight === "number" &&
    hintedHeight > 0
  ) {
    return { width: hintedWidth, height: hintedHeight };
  }

  if (document.elements.length === 0) {
    return { width: DEFAULT_PDF_WIDTH, height: DEFAULT_PDF_HEIGHT };
  }

  const minX = Math.min(...document.elements.map((element) => element.x));
  const minY = Math.min(...document.elements.map((element) => element.y));
  const maxX = Math.max(
    ...document.elements.map((element) => element.x + element.width),
  );
  const maxY = Math.max(
    ...document.elements.map((element) => element.y + element.height),
  );

  return {
    width: Math.max(Math.ceil(maxX - minX + CONTENT_PADDING * 2), 320),
    height: Math.max(Math.ceil(maxY - minY + CONTENT_PADDING * 2), 240),
  };
}

export async function exportPdf(document: DiagramDocument): Promise<Blob> {
  const dimensions = resolvePdfExportDimensions(document);
  const { content } = exportSvg(document, dimensions);
  const svgBlob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = svgUrl;
    await image.decode();

    const canvas = window.document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("PDF export failed: canvas context unavailable");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: dimensions.width >= dimensions.height ? "landscape" : "portrait",
      unit: "pt",
      format: [dimensions.width, dimensions.height],
    });
    pdf.addImage(imageDataUrl, "PNG", 0, 0, dimensions.width, dimensions.height);
    return pdf.output("blob");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
