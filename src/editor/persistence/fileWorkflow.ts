import type { DiagramDocument } from '../types';
import { deserializeDocument, serializeDocument } from './yamlCodec';

export function exportDocumentToYaml(document: DiagramDocument): string {
  return serializeDocument(document);
}

export function createYamlExportBlob(document: DiagramDocument): Blob {
  const yaml = exportDocumentToYaml(document);
  return new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
}

export function createDownloadFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `gesture-diagram-${timestamp}.yaml`;
}

export async function importDocumentFromText(
  source: string,
): Promise<DiagramDocument> {
  return Promise.resolve(deserializeDocument(source));
}

export async function importDocumentFromFile(
  file: File,
): Promise<DiagramDocument> {
  const source = await file.text();
  return importDocumentFromText(source);
}
