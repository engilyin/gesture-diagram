import { getProfile } from "../editor/profiles/registry";
import type { DiagramElement } from "../editor/types";

export type PaletteStyleVariant = "filled" | "outlined" | "dashed";

export type PaletteAction = {
  id: string;
  label: string;
  kind:
    | "convert"
    | "style"
    | "align-left"
    | "align-center"
    | "align-right"
    | "align-top"
    | "align-middle"
    | "align-bottom"
    | "distribute-horizontal"
    | "distribute-vertical"
    | "match-width"
    | "match-height"
    | "copy-style"
    | "layout-free"
    | "layout-row"
    | "layout-column"
    | "layout-grid"
    | "collapse-container"
    | "expand-container"
    | "send-to-layer"
    | "duplicate"
    | "delete"
    | "group"
    | "ungroup"
    | "lock"
    | "unlock";
  layerId?: string;
  rank: number;
};

const shapeChoices: Array<{
  kind: DiagramElement["kind"];
  label: string;
  icon: string;
}> = [
  { kind: "rect", label: "Rectangle", icon: "▭" },
  { kind: "ellipse", label: "Ellipse", icon: "◯" },
  { kind: "diamond", label: "Diamond", icon: "◇" },
  { kind: "triangle", label: "Triangle", icon: "△" },
  { kind: "container", label: "Container", icon: "▣" },
  { kind: "text", label: "Text", icon: "T" },
  { kind: "line", label: "Line", icon: "↗" },
];

interface ContextPaletteProps {
  actions: PaletteAction[];
  profileId?: string;
  onAction?: (action: PaletteAction) => void;
  selectedKind?: DiagramElement["kind"];
  selectedColor?: string;
  selectedStyleVariant?: PaletteStyleVariant;
  position?: { x: number; y: number };
  colorSwatches?: string[];
  onConvertKind?: (kind: DiagramElement["kind"]) => void;
  onSelectColor?: (color: string) => void;
  onSelectStyleVariant?: (style: PaletteStyleVariant) => void;
  selectedTextAlignHorizontal?: "left" | "center" | "right";
  selectedTextAlignVertical?: "top" | "middle" | "bottom";
  onSelectTextAlignHorizontal?: (value: "left" | "center" | "right") => void;
  onSelectTextAlignVertical?: (value: "top" | "middle" | "bottom") => void;
  selectedTextOverflowMode?: "grow-shape" | "shrink-text";
  onSelectTextOverflowMode?: (value: "grow-shape" | "shrink-text") => void;
}

export function ContextPalette({
  actions,
  profileId,
  onAction,
  selectedKind,
  selectedColor,
  selectedStyleVariant,
  position,
  colorSwatches = [],
  onConvertKind,
  onSelectColor,
  onSelectStyleVariant,
  selectedTextAlignHorizontal,
  selectedTextAlignVertical,
  onSelectTextAlignHorizontal,
  onSelectTextAlignVertical,
  selectedTextOverflowMode,
  onSelectTextOverflowMode,
}: ContextPaletteProps) {
  const profile = profileId ? getProfile(profileId) : null;
  const priorityByKind = new Map<string, number>(
    (profile?.actionPriority ?? []).map((kind, index) => [kind, index]),
  );

  return (
    <div
      className="context-palette"
      aria-label="Context actions"
      role="toolbar"
      style={
        position
          ? {
              position: "absolute",
              left: `${position.x}px`,
              top: `${position.y}px`,
              zIndex: 30,
            }
          : undefined
      }
    >
      {selectedKind && onConvertKind ? (
        <div className="context-palette-section">
          {shapeChoices.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              className="context-palette-icon-button"
              aria-label={`Convert to ${choice.label}`}
              aria-pressed={selectedKind === choice.kind}
              onClick={() => onConvertKind(choice.kind)}
            >
              {choice.icon}
            </button>
          ))}
        </div>
      ) : null}

      {colorSwatches.length > 0 && onSelectColor ? (
        <div className="context-palette-section">
          {colorSwatches.map((color) => (
            <button
              key={color}
              type="button"
              className="context-palette-swatch"
              aria-label={`Set color ${color}`}
              aria-pressed={selectedColor === color}
              style={{ background: color }}
              onClick={() => onSelectColor(color)}
            />
          ))}
        </div>
      ) : null}

      {onSelectStyleVariant ? (
        <div className="context-palette-section">
          {(["filled", "outlined", "dashed"] as const).map((style) => (
            <button
              key={style}
              type="button"
              className="context-palette-style-button"
              aria-label={`Set ${style} style`}
              aria-pressed={selectedStyleVariant === style}
              onClick={() => onSelectStyleVariant(style)}
            >
              {style}
            </button>
          ))}
        </div>
      ) : null}

      {onSelectTextAlignHorizontal || onSelectTextAlignVertical ? (
        <div className="context-palette-section">
          {onSelectTextAlignHorizontal
            ? (["left", "center", "right"] as const).map((align) => (
                <button
                  key={`text-h-${align}`}
                  type="button"
                  className="context-palette-style-button"
                  aria-label={`Set text horizontal ${align}`}
                  aria-pressed={selectedTextAlignHorizontal === align}
                  onClick={() => onSelectTextAlignHorizontal(align)}
                >
                  H:{align}
                </button>
              ))
            : null}
          {onSelectTextAlignVertical
            ? (["top", "middle", "bottom"] as const).map((align) => (
                <button
                  key={`text-v-${align}`}
                  type="button"
                  className="context-palette-style-button"
                  aria-label={`Set text vertical ${align}`}
                  aria-pressed={selectedTextAlignVertical === align}
                  onClick={() => onSelectTextAlignVertical(align)}
                >
                  V:{align}
                </button>
              ))
            : null}
        </div>
      ) : null}

      {onSelectTextOverflowMode ? (
        <div className="context-palette-section">
          {([
            ["grow-shape", "Overflow: Grow shape"],
            ["shrink-text", "Overflow: Shrink text"],
          ] as const).map(([mode, label]) => (
            <button
              key={`text-overflow-${mode}`}
              type="button"
              className="context-palette-style-button"
              aria-label={`Set text overflow ${mode}`}
              aria-pressed={selectedTextOverflowMode === mode}
              onClick={() => onSelectTextOverflowMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

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
            className="context-palette-secondary-action"
            onClick={() => onAction?.(action)}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
