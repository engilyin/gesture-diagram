import type { DiagramDocument } from "../types";
import { exportSvg, type SvgExportOptions } from "./svg";

export type HeadlessPngRenderer = (
  svgContent: string,
  options: {
    width: number;
    height: number;
    background?: string;
  },
) => Promise<Uint8Array | ArrayBuffer>;

export type HeadlessSvgExportResult = {
  content: string;
  warnings: string[];
  width: number;
  height: number;
};

export type HeadlessPngExportOptions = SvgExportOptions & {
  background?: string;
  renderPng: HeadlessPngRenderer;
};

const DEFAULT_EXPORT_WIDTH = 1600;
const DEFAULT_EXPORT_HEIGHT = 1000;

function resolveDimensions(options: SvgExportOptions): {
  width: number;
  height: number;
} {
  return {
    width: options.width ?? DEFAULT_EXPORT_WIDTH,
    height: options.height ?? DEFAULT_EXPORT_HEIGHT,
  };
}

export function exportSvgHeadless(
  document: DiagramDocument,
  options: SvgExportOptions = {},
): HeadlessSvgExportResult {
  const { width, height } = resolveDimensions(options);
  const { content, warnings } = exportSvg(document, { width, height });

  return { content, warnings, width, height };
}

export async function exportPngHeadless(
  document: DiagramDocument,
  options: HeadlessPngExportOptions,
): Promise<Uint8Array> {
  const { renderPng, background } = options;
  const { content, width, height } = exportSvgHeadless(document, options);
  const rendered = await renderPng(content, { width, height, background });

  if (rendered instanceof Uint8Array) {
    return rendered;
  }
  if (rendered instanceof ArrayBuffer) {
    return new Uint8Array(rendered);
  }

  throw new Error(
    "Headless PNG export failed: renderer must return Uint8Array or ArrayBuffer.",
  );
}
