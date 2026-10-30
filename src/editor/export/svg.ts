import type { DiagramDocument } from "../types";
import { collectExportFidelity } from "./fidelity";

const SVG_WIDTH = 1600;
const SVG_HEIGHT = 1000;

export type SvgExportOptions = {
  width?: number;
  height?: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function exportSvg(
  document: DiagramDocument,
  options: SvgExportOptions = {},
): {
  content: string;
  warnings: string[];
} {
  const width = options.width ?? SVG_WIDTH;
  const height = options.height ?? SVG_HEIGHT;

  const elements = document.elements.map((element) => {
    const stroke = element.color ?? "#1f2937";
    const strokeWidth = element.strokeWidth ?? 2;

    if (element.kind === "line") {
      return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    if (element.kind === "ink" && element.points && element.points.length > 1) {
      const points = element.points
        .map((point) => `${point.x},${point.y}`)
        .join(" ");
      return `<polyline points="${escapeXml(points)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" ry="8" fill="rgba(79,70,229,0.12)" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  });

  const content = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...elements,
    "</svg>",
  ].join("\n");

  const fidelity = collectExportFidelity(document);
  return { content, warnings: fidelity.warnings };
}
