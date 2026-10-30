export type Selection = {
  ids: string[];
};

export function makeSelection(ids: string[] = []): Selection {
  return { ids };
}

export function hasSelection(selection: Selection): boolean {
  return selection.ids.length > 0;
}

export function getPrimarySelection(selection: Selection): string | null {
  return selection.ids[0] ?? null;
}
