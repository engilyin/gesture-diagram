export type { DiagramDocument, DiagramElement, GestureStroke, Point } from './types';
export {
  createDocument,
  createDocumentFromElements,
  getDocumentElements,
  loadDocument,
  saveDocument,
} from './document';
export { createRectangle, createLine } from './shapes';
export { recognizeStroke } from './recognition';
export { CURRENT_SCHEMA_VERSION, type PersistedDiagramDocument } from './schema';
export { serializeDocument, deserializeDocument } from './persistence/yamlCodec';
export {
  getBrowserStorageKey,
  loadFromBrowserStorage,
  saveToBrowserStorage,
} from './persistence/browserStorage';
export {
  createDownloadFilename,
  createYamlExportBlob,
  exportDocumentToYaml,
  importDocumentFromFile,
  importDocumentFromText,
} from './persistence/fileWorkflow';
