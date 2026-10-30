export type { DiagramDocument, DiagramElement, GestureStroke, Point } from './types';
export { createDocument, loadDocument, saveDocument } from './document';
export { createRectangle, createLine } from './shapes';
export { recognizeStroke } from './recognition';
export { CURRENT_SCHEMA_VERSION, type PersistedDiagramDocument } from './schema';
export { serializeDocument, deserializeDocument } from './persistence/yamlCodec';
