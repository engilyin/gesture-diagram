import * as yaml from 'js-yaml';
import type { DiagramDocument } from '../types';
import { assertValidPersistedDocument, toPersistedDocument } from '../schema';

export function serializeDocument(
  document: DiagramDocument,
  nowIso?: string,
): string {
  const persisted = toPersistedDocument(document, nowIso);
  return yaml.dump(persisted, {
    noRefs: true,
    sortKeys: true,
  });
}

export function deserializeDocument(yamlContent: string): DiagramDocument {
  const parsed = yaml.load(yamlContent);
  const persisted = assertValidPersistedDocument(parsed);

  return {
    ...persisted.document,
    elements: [...persisted.document.elements],
    metadata: {
      schemaVersion: persisted.schemaVersion,
      updatedAt: persisted.updatedAt,
    },
  };
}
