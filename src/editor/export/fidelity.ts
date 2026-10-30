import type { DiagramDocument } from "../types";

export type ExportFidelityReport = {
  warnings: string[];
};

export function collectExportFidelity(
  document: DiagramDocument,
): ExportFidelityReport {
  const hasUnsupportedText = document.elements.some(
    (element) => element.kind === "text",
  );
  return {
    warnings: hasUnsupportedText
      ? ["Text elements are exported as basic boxes in this version."]
      : [],
  };
}
