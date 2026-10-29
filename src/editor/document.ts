import type { DiagramDocument } from './types';

export function createDocument(): DiagramDocument {
  return {
    version: '0.1.0',
    elements: [],
  };
}
