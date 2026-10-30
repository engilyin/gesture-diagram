import type { ResolvedPort } from "../editor/ports";

interface ConnectionPortsProps {
  ports: ResolvedPort[];
}

const targetSize = 14;

export function ConnectionPorts({ ports }: ConnectionPortsProps) {
  if (ports.length === 0) {
    return null;
  }

  return (
    <div className="connection-ports" aria-label="Connection ports">
      {ports.map((port) => (
        <div
          key={port.id}
          aria-label={`Connection port ${port.id}`}
          className="connection-port"
          style={{
            left: port.absoluteX - targetSize / 2,
            top: port.absoluteY - targetSize / 2,
            width: targetSize,
            height: targetSize,
            minWidth: targetSize,
            minHeight: targetSize,
          }}
        />
      ))}
    </div>
  );
}
