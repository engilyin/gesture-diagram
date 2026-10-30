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
}

const handleDescriptors: Array<{
  handle: ResizeHandle;
  label: string;
  style: React.CSSProperties;
}> = [
  { handle: "nw", label: "Resize north-west", style: { left: -6, top: -6 } },
  { handle: "ne", label: "Resize north-east", style: { right: -6, top: -6 } },
  {
    handle: "se",
    label: "Resize south-east",
    style: { right: -6, bottom: -6 },
  },
  { handle: "sw", label: "Resize south-west", style: { left: -6, bottom: -6 } },
];

export function SelectionHandles({
  x,
  y,
  width,
  height,
  onResizeStart,
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
          style={style}
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
    </div>
  );
}
