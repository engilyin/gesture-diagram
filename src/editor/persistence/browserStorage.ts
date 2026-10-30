import type { DiagramDocument } from '../types';
import { deserializeDocument, serializeDocument } from './yamlCodec';

const STORAGE_KEY = 'gesture-diagram.document.v1';

export function saveToBrowserStorage(document: DiagramDocument): void {
  const payload = serializeDocument(document);
  localStorage.setItem(STORAGE_KEY, payload);
}

export function loadFromBrowserStorage(): DiagramDocument | null {
  const payload = localStorage.getItem(STORAGE_KEY);
  if (!payload) {
    return null;
  }

  return deserializeDocument(payload);
}

export function getBrowserStorageKey(): string {
  return STORAGE_KEY;
}
