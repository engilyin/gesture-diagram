import type { ResolvedPort } from "../editor/ports";
import type { PointerEvent as ReactPointerEvent } from "react";

interface ConnectionPortsProps {
  ports: ResolvedPort[];
  onPortPointerDown?: (
    port: ResolvedPort,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}

const targetSize = 16;

export function ConnectionPorts({ ports, onPortPointerDown }: ConnectionPortsProps) {
  if (ports.length === 0) {
    return null;
  }

  return (
    <div className="connection-ports" aria-label="Connection ports">
      {ports.map((port) => (
        <button
          type="button"
          key={port.id}
          aria-label={`Connection port ${port.id}`}
          className="connection-port"
          onPointerDown={(event) => onPortPointerDown?.(port, event)}
          style={{
            left: port.absoluteX - targetSize / 2,
            top: port.absoluteY - targetSize / 2,
            width: targetSize,
            height: targetSize,
            minWidth: targetSize,
            minHeight: targetSize,
            cursor: "crosshair",
          }}
        />
      ))}
    </div>
  );
}
