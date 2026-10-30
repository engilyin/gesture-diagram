interface GestureFallbackPanelProps {
  onKeepInk: () => void;
  onRetryRecognition: () => void;
  onChooseShape: (kind: "rect" | "ellipse" | "diamond" | "text" | "line") => void;
  message?: string;
}

export function GestureFallbackPanel({
  onKeepInk,
  onRetryRecognition,
  onChooseShape,
  message = "This stroke is ambiguous. Keep it as ink or retry recognition.",
}: GestureFallbackPanelProps) {
  return (
    <div
      className="gesture-fallback-panel"
      role="dialog"
      aria-label="Gesture fallback options"
    >
      <p>{message}</p>
      <div className="gesture-fallback-actions">
        <button type="button" onClick={() => onChooseShape("rect")}>
          Rectangle
        </button>
        <button type="button" onClick={() => onChooseShape("ellipse")}>
          Ellipse
        </button>
        <button type="button" onClick={() => onChooseShape("diamond")}>
          Diamond
        </button>
        <button type="button" onClick={() => onChooseShape("text")}>
          Text
        </button>
        <button type="button" onClick={() => onChooseShape("line")}>
          Line
        </button>
        <button type="button" onClick={onKeepInk}>
          Keep as Ink
        </button>
        <button type="button" onClick={onRetryRecognition}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
