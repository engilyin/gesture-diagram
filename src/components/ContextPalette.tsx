import { getProfile } from "../editor/profiles/registry";

export type PaletteAction = {
  id: string;
  label: string;
  kind: "convert" | "style" | "duplicate" | "delete" | "group" | "ungroup";
  rank: number;
};

interface ContextPaletteProps {
  actions: PaletteAction[];
  profileId?: string;
  onAction?: (action: PaletteAction) => void;
}

export function ContextPalette({
  actions,
  profileId,
  onAction,
}: ContextPaletteProps) {
  const profile = profileId ? getProfile(profileId) : null;
  const priorityByKind = new Map(
    (profile?.actionPriority ?? []).map((kind, index) => [kind, index]),
  );

  return (
    <div
      className="context-palette"
      aria-label="Context actions"
      role="toolbar"
    >
      {actions
        .slice()
        .sort((a, b) => {
          const aPriority = priorityByKind.get(a.kind);
          const bPriority = priorityByKind.get(b.kind);

          if (aPriority !== undefined || bPriority !== undefined) {
            return (
              (aPriority ?? Number.MAX_SAFE_INTEGER) -
              (bPriority ?? Number.MAX_SAFE_INTEGER)
            );
          }

          return a.rank - b.rank;
        })
        .map((action) => (
          <button
            key={action.id}
            type="button"
            aria-label={action.label}
            onClick={() => onAction?.(action)}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
