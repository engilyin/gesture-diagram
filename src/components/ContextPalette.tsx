export type PaletteAction = {
  id: string;
  label: string;
  kind: "convert" | "style" | "duplicate" | "delete";
  rank: number;
};

interface ContextPaletteProps {
  actions: PaletteAction[];
  onAction?: (action: PaletteAction) => void;
}

export function ContextPalette({ actions, onAction }: ContextPaletteProps) {
  return (
    <div
      className="context-palette"
      aria-label="Context actions"
      role="toolbar"
    >
      {actions
        .slice()
        .sort((a, b) => a.rank - b.rank)
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
