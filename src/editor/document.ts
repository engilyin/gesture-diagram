import type { DiagramDocument, DiagramElement } from './types';

export function createDocument(): DiagramDocument {
  return {
    version: '0.1.0',
    elements: [],
  };
}

export function loadDocument(input: DiagramDocument): DiagramDocument {
  return {
    version: input.version,
    elements: [...input.elements],
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };
}

export function saveDocument(document: DiagramDocument): DiagramDocument {
  return {
    version: document.version,
    elements: [...document.elements],
    metadata: document.metadata ? { ...document.metadata } : undefined,
  };
}

export function createDocumentFromElements(
  elements: DiagramElement[],
  version = '0.1.0',
): DiagramDocument {
  return {
    version,
    elements: [...elements],
  };
}

export function getDocumentElements(document: DiagramDocument): DiagramElement[] {
  return [...document.elements];
}
