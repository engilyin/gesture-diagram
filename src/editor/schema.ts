import type { DiagramDocument, DiagramElement } from './types';

export const CURRENT_SCHEMA_VERSION = '1.1.0';

export type PersistedDiagramDocument = {
  schemaVersion: string;
  updatedAt: string;
  document: DiagramDocument;
};

function isValidElement(input: unknown): input is DiagramElement {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as Partial<DiagramElement>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    (candidate.rotation == null || typeof candidate.rotation === "number") &&
    (candidate.locked == null || typeof candidate.locked === "boolean") &&
    (candidate.parentId == null || typeof candidate.parentId === "string")
  );
}

function isValidDocument(input: unknown): input is DiagramDocument {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as Partial<DiagramDocument>;
  return (
    typeof candidate.version === 'string' &&
    Array.isArray(candidate.elements) &&
    candidate.elements.every((element) => isValidElement(element)) &&
    isValidDocumentSettings(candidate.settings)
  );
}

function isValidDocumentSettings(
  input: unknown,
): input is DiagramDocument["settings"] {
  if (input == null) {
    return true;
  }
  if (typeof input !== "object") {
    return false;
  }

  const candidate = input as NonNullable<DiagramDocument["settings"]>;
  const canvas = candidate.canvas;
  const validCanvas =
    canvas == null ||
    (typeof canvas === "object" &&
      (canvas.width == null || typeof canvas.width === "number") &&
      (canvas.height == null || typeof canvas.height === "number"));
  const layers = candidate.layers;
  const validLayers =
    layers == null ||
    (Array.isArray(layers) &&
      layers.every(
        (layer) =>
          layer &&
          typeof layer === "object" &&
          typeof layer.id === "string" &&
          typeof layer.name === "string" &&
          typeof layer.color === "string" &&
          typeof layer.visible === "boolean" &&
          typeof layer.locked === "boolean",
      ));

  return (
    (candidate.title == null || typeof candidate.title === "string") &&
    (candidate.background == null || typeof candidate.background === "string") &&
    validCanvas &&
    validLayers
  );
}

export function toPersistedDocument(
  document: DiagramDocument,
  nowIso = new Date().toISOString(),
): PersistedDiagramDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: nowIso,
    document: {
      ...document,
      elements: [...document.elements],
      metadata: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: nowIso,
      },
    },
  };
}

export function isSupportedSchemaVersion(version: string): boolean {
  return version === CURRENT_SCHEMA_VERSION;
}

export function assertValidPersistedDocument(
  input: unknown,
): PersistedDiagramDocument {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid persisted document payload');
  }

  const candidate = input as Partial<PersistedDiagramDocument>;
  const schemaVersion = candidate.schemaVersion;

  if (typeof schemaVersion !== 'string' || !isSupportedSchemaVersion(schemaVersion)) {
    throw new Error(`Unsupported schema version: ${String(schemaVersion ?? '')}`);
  }

  if (typeof candidate.updatedAt !== 'string') {
    throw new Error('Persisted document is missing updatedAt metadata');
  }

  if (!isValidDocument(candidate.document)) {
    throw new Error('Persisted document has invalid document payload');
  }

  return {
    schemaVersion,
    updatedAt: candidate.updatedAt,
    document: candidate.document,
  };
}
