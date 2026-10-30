import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../document';
import { createRectangle } from '../shapes';
import {
  getBrowserStorageKey,
  loadFromBrowserStorage,
  saveToBrowserStorage,
} from '../persistence/browserStorage';

describe('browser storage persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when storage is empty', () => {
    expect(loadFromBrowserStorage()).toBeNull();
  });

  it('round-trips a stored document', () => {
    const document = createDocument();
    document.elements.push(createRectangle(10, 20, 80, 45));

    saveToBrowserStorage(document);
    const loaded = loadFromBrowserStorage();

    expect(loaded).toBeTruthy();
    expect(loaded?.elements).toEqual(document.elements);
  });

  it('throws actionable error for malformed persisted content', () => {
    localStorage.setItem(
      getBrowserStorageKey(),
      'schemaVersion: "invalid"\nupdatedAt: "2026-01-01T00:00:00.000Z"\ndocument:\n  version: "0.1.0"\n  elements: []',
    );

    expect(() => loadFromBrowserStorage()).toThrow('Unsupported schema version');
  });
});
