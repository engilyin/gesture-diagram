export type Selection = {
  ids: string[];
};

export function makeSelection(ids: string[] = []): Selection {
  return { ids };
}

export function hasSelection(selection: Selection): boolean {
  return selection.ids.length > 0;
}
