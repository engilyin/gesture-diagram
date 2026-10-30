export type FidelityIssue = {
  code: string;
  message: string;
};

export type FidelityReport = {
  warnings: FidelityIssue[];
};

export function createFidelityReport(
  warnings: FidelityIssue[],
): FidelityReport {
  return { warnings };
}
