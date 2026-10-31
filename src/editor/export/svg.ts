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

    if (element.kind === "ellipse") {
      return `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="rgba(79,70,229,0.12)" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    if (element.kind === "diamond") {
      const top = `${element.x + element.width / 2},${element.y}`;
      const right = `${element.x + element.width},${element.y + element.height / 2}`;
      const bottom = `${element.x + element.width / 2},${element.y + element.height}`;
      const left = `${element.x},${element.y + element.height / 2}`;
      return `<polygon points="${top} ${right} ${bottom} ${left}" fill="rgba(79,70,229,0.12)" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    if (element.kind === "triangle") {
      const top = `${element.x + element.width / 2},${element.y}`;
      const right = `${element.x + element.width},${element.y + element.height}`;
      const left = `${element.x},${element.y + element.height}`;
      return `<polygon points="${top} ${right} ${left}" fill="rgba(79,70,229,0.12)" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    if (element.kind === "ink" && element.points && element.points.length > 1) {
      const points = element.points
        .map((point) => `${point.x},${point.y}`)
        .join(" ");
      return `<polyline points="${escapeXml(points)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
    }

    if (element.kind === "text") {
      const text = escapeXml(element.text ?? "");
      return `<g><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="transparent" stroke="${escapeXml(stroke)}" stroke-dasharray="4 3" stroke-width="${Math.max(1, strokeWidth - 1)}" /><text x="${element.x + 8}" y="${element.y + 24}" font-family="Inter, Arial, sans-serif" font-size="16" fill="${escapeXml(stroke)}">${text}</text></g>`;
    }

    if (element.kind === "container") {
      const title = escapeXml((element.text ?? "Container").trim());
      return `<g><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" ry="8" fill="rgba(148,163,184,0.08)" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-dasharray="6 4" /><text x="${element.x + 10}" y="${element.y + 20}" font-family="Inter, Arial, sans-serif" font-size="12" fill="${escapeXml(stroke)}">${title}</text></g>`;
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
