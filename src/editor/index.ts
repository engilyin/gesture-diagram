export type {
  DiagramDocument,
  DiagramElement,
  DiagramProfile,
  GestureStroke,
  Point,
} from "./types";
export {
  createDocument,
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from "./document";
export { createRectangle, createLine } from "./shapes";
export { recognizeStroke } from "./recognition";
export {
  CURRENT_SCHEMA_VERSION,
  type PersistedDiagramDocument,
} from "./schema";
export {
  serializeDocument,
  deserializeDocument,
} from "./persistence/yamlCodec";
export {
  getBrowserStorageKey,
  loadFromBrowserStorage,
  saveToBrowserStorage,
} from "./persistence/browserStorage";
export {
  createDownloadFilename,
  createYamlExportBlob,
  exportDocumentToYaml,
  importDocumentFromFile,
  importDocumentFromText,
} from "./persistence/fileWorkflow";
export {
  attachConnectorEndpoints,
  enforceConnectorInvariants,
  type ConnectorInvariantResult,
} from "./connectorGraph";
export {
  getGroupedSelectionIds,
  groupElements,
  moveGroupedElements,
  ungroupElements,
} from "./grouping";
export {
  createFidelityReport,
  type FidelityIssue,
  type FidelityReport,
} from "./import/fidelity";
export { importDrawIo } from "./import/drawio";
export { importMermaid } from "./import/mermaid";
export {
  collectExportFidelity,
  type ExportFidelityReport,
} from "./export/fidelity";
export { exportSvg } from "./export/svg";
export { exportPng } from "./export/png";
export {
  getDefaultProfile,
  getProfile,
  listProfiles,
} from "./profiles/registry";
export type {
  GestureDiagramApi,
  GestureDiagramChangeEvent,
  GestureDiagramConfig,
} from "../embed/types";
