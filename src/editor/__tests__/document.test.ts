import { describe, expect, it } from 'vitest';
import { createDocument } from '../document';

describe('createDocument', () => {
  it('creates an empty versioned document', () => {
    const document = createDocument();
    expect(document.version).toBe('0.1.0');
    expect(document.elements).toEqual([]);
  });
});
