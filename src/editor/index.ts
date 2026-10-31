export type {
  DiagramDocument,
  DiagramElement,
  DiagramProfile,
  GestureStroke,
  Point,
} from "./types";
export {
  createDocumentChangeDispatcher,
  createDocument,
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from "./document";
export type {
  DocumentChangeDispatcher,
  DocumentChangeSubscriber,
} from "./document";
export {
  createContainer,
  createDiamond,
  createEllipse,
  createLine,
  createRectangle,
  createText,
  createTriangle,
} from "./shapes";
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
  autoSizeContainers,
  collectOwnedDescendantIds,
  CONTAINER_PADDING,
  getGroupedSelectionIds,
  groupElements,
  isContainerElement,
  moveGroupedElements,
  reconcileContainerOwnership,
  releaseChildrenFromParents,
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
  exportPngHeadless,
  exportSvgHeadless,
  type HeadlessPngExportOptions,
  type HeadlessPngRenderer,
  type HeadlessSvgExportResult,
} from "./export/headless";
export {
  getDefaultProfile,
  getProfile,
  listProfiles,
} from "./profiles/registry";
export type {
  CollaborationAdapter,
  CollaborationAdapterError,
  CollaborationAdapterHooks,
} from "./collaboration/adapter";
export {
  COLLABORATION_EVENT_VERSION,
  createDocumentChangeEvent,
} from "./collaboration/events";
export type {
  CollaborationEventEnvelope,
  CollaborationEventType,
  CollaborationLifecycleEvent,
  DiagramSyncEvent,
} from "./collaboration/events";
export type {
  GestureDiagramApi,
  GestureDiagramChangeEvent,
  GestureDiagramConfig,
} from "../embed/types";
