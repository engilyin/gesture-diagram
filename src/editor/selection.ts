export type Selection = {
  ids: string[];
};

export function makeSelection(ids: string[] = []): Selection {
  return { ids };
}
