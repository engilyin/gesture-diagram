import type { ResizeHandle } from "../editor/transform";

interface SelectionHandlesProps {
  x: number;
  y: number;
  width: number;
  height: number;
  onResizeStart: (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onRotateStart?: (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  isRotating?: boolean;
}

const handleDescriptors: Array<{
  handle: ResizeHandle;
  label: string;
  style: React.CSSProperties;
}> = [
  { handle: "nw", label: "Resize north-west", style: { left: -8, top: -8 } },
  { handle: "ne", label: "Resize north-east", style: { right: -8, top: -8 } },
  {
    handle: "se",
    label: "Resize south-east",
    style: { right: -8, bottom: -8 },
  },
  { handle: "sw", label: "Resize south-west", style: { left: -8, bottom: -8 } },
];

export function SelectionHandles({
  x,
  y,
  width,
  height,
  onResizeStart,
  onRotateStart,
  isRotating = false,
}: SelectionHandlesProps) {
  return (
    <div
      className="selection-handles"
      aria-label="Selection handles"
      style={{
        left: x,
        top: y,
        width,
        height,
      }}
    >
      {handleDescriptors.map(({ handle, label, style }) => (
        <button
          key={handle}
          type="button"
          className="selection-handle"
          aria-label={label}
          style={{
            ...style,
            cursor:
              handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize",
          }}
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
      {onRotateStart &&
        handleDescriptors.map(({ handle, style }) => (
          <button
            key={`rotate-${handle}`}
            type="button"
            className="rotation-handle"
            aria-label={`Rotate near ${handle}`}
            style={{
              ...style,
              left: style.left != null ? Number(style.left) - 24 : style.left,
              right: style.right != null ? Number(style.right) - 24 : style.right,
              top: style.top != null ? Number(style.top) - 24 : style.top,
              bottom: style.bottom != null ? Number(style.bottom) - 24 : style.bottom,
              cursor: isRotating ? "grabbing" : "grab",
            }}
            onPointerDown={(event) => onRotateStart(handle, event)}
          />
        ))}
    </div>
  );
}
