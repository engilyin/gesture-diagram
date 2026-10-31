import type { DiagramElement } from "../types";

export const maxCompressedImportBytes = 10 * 1024 * 1024;
const maxEntityExpansionBytes = 1 * 1024 * 1024;
const maxEntityDefinitionCount = 128;

function estimateEntityExpansion(
  name: string,
  entities: Map<string, string>,
  cache: Map<string, number>,
  stack: Set<string>,
): number {
  if (cache.has(name)) {
    return cache.get(name) ?? 0;
  }
  if (stack.has(name)) {
    throw new Error("Import failed: circular XML entity definitions detected.");
  }
  const value = entities.get(name);
  if (!value) {
    return 0;
  }
  stack.add(name);
  let total = value.length;
  const refs = Array.from(value.matchAll(/&([a-zA-Z0-9_.:-]+);/g));
  for (const ref of refs) {
    const refName = ref[1];
    if (!refName) {
      continue;
    }
    total += estimateEntityExpansion(refName, entities, cache, stack);
    if (total > maxEntityExpansionBytes) {
      throw new Error("Import failed: XML entity expansion exceeds safe limit.");
    }
  }
  stack.delete(name);
  cache.set(name, total);
  return total;
}

export function assertSafeXmlEntities(source: string): void {
  const doctypeSubsetMatch = source.match(/<!DOCTYPE[\s\S]*?\[([\s\S]*?)\]>/i);
  const subset = doctypeSubsetMatch?.[1];
  if (!subset) {
    return;
  }
  const entityMatches = Array.from(
    subset.matchAll(/<!ENTITY\s+([a-zA-Z0-9_.:-]+)\s+"([^"]*)"\s*>/g),
  );
  if (entityMatches.length === 0) {
    return;
  }
  if (entityMatches.length > maxEntityDefinitionCount) {
    throw new Error("Import failed: too many XML entity definitions.");
  }

  const entities = new Map<string, string>();
  entityMatches.forEach((match) => {
    const name = match[1];
    const value = match[2];
    if (!name || value === undefined) {
      return;
    }
    entities.set(name, value);
  });

  const cache = new Map<string, number>();
  let totalExpansion = 0;
  entities.forEach((_value, name) => {
    const estimated = estimateEntityExpansion(name, entities, cache, new Set<string>());
    const usageCount = source.split(`&${name};`).length - 1;
    totalExpansion += estimated * Math.max(usageCount, 1);
    if (totalExpansion > maxEntityExpansionBytes) {
      throw new Error("Import failed: XML entity expansion exceeds safe limit.");
    }
  });
}

export function assertNoCircularParentReferences(elements: DiagramElement[]): void {
  const byId = new Map(elements.map((element) => [element.id, element]));

  for (const element of elements) {
    const visited = new Set<string>([element.id]);
    let cursor = element;
    while (cursor.parentId) {
      if (visited.has(cursor.parentId)) {
        throw new Error("Import failed: circular parent references detected.");
      }
      visited.add(cursor.parentId);
      const parent = byId.get(cursor.parentId);
      if (!parent) {
        break;
      }
      cursor = parent;
    }
  }
}
