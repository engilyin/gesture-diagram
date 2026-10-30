import { describe, expect, it } from 'vitest';
import { createDocument, loadDocument, saveDocument } from '../document';
import { createRectangle } from '../shapes';

describe('createDocument', () => {
  it('creates an empty versioned document', () => {
    const document = createDocument();
    expect(document.version).toBe('0.1.0');
    expect(document.elements).toEqual([]);
  });

  it('clones loaded and saved documents', () => {
    const source = createDocument();
    source.elements.push(createRectangle(1, 2, 30, 40));
    source.metadata = {
      schemaVersion: '1.0.0',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    source.settings = {
      title: "Release candidate",
      background: "#ffffff",
      canvas: {
        width: 1600,
        height: 1000,
      },
    };

    const loaded = loadDocument(source);
    const saved = saveDocument(loaded);

    expect(saved).toEqual(source);
    expect(saved).not.toBe(source);
    expect(saved.elements).not.toBe(source.elements);
    expect(saved.settings).not.toBe(source.settings);
    expect(saved.settings?.canvas).not.toBe(source.settings?.canvas);
  });
});
