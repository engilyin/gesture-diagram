import { describe, expect, it } from 'vitest';
import { createDocument } from '../document';
import { createLine, createRectangle } from '../shapes';
import { deserializeDocument, serializeDocument } from '../persistence/yamlCodec';
import { CURRENT_SCHEMA_VERSION } from '../schema';

describe('yaml codec', () => {
  it('serializes and deserializes a document without losing stable ids', () => {
    const document = createDocument();
    const rectangle = createRectangle(10, 12, 110, 75);
    const connector = createLine(140, 40, 180, 20);
    document.elements.push(rectangle, connector);

    const yaml = serializeDocument(document, '2026-01-01T00:00:00.000Z');
    const parsed = deserializeDocument(yaml);

    expect(parsed.version).toBe(document.version);
    expect(parsed.elements).toEqual(document.elements);
    expect(parsed.metadata).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.elements[0].id).toBe(rectangle.id);
    expect(parsed.elements[1].id).toBe(connector.id);
  });

  it('throws when schema version is unsupported', () => {
    const malformedYaml = [
      'schemaVersion: "9.9.9"',
      'updatedAt: "2026-01-01T00:00:00.000Z"',
      'document:',
      '  version: "0.1.0"',
      '  elements: []',
    ].join('\n');

    expect(() => deserializeDocument(malformedYaml)).toThrow(
      'Unsupported schema version: 9.9.9',
    );
  });
});
