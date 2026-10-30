interface GestureFallbackPanelProps {
  onKeepInk: () => void;
  onRetryRecognition: () => void;
  message?: string;
}

export function GestureFallbackPanel({
  onKeepInk,
  onRetryRecognition,
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
