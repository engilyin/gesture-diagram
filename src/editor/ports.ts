import type { DiagramElement } from "./types";

export type PortId = "top" | "right" | "bottom" | "left";

export type PortOffset = {
  id: PortId;
  x: number;
  y: number;
};

export type ResolvedPort = PortOffset & {
  absoluteX: number;
  absoluteY: number;
};

const defaultPortOffsetsByKind: Record<
  DiagramElement["kind"],
  PortOffset[]
> = {
  rect: [
    { id: "top", x: 0.5, y: 0 },
    { id: "right", x: 1, y: 0.5 },
    { id: "bottom", x: 0.5, y: 1 },
    { id: "left", x: 0, y: 0.5 },
  ],
  text: [
    { id: "top", x: 0.5, y: 0 },
    { id: "right", x: 1, y: 0.5 },
    { id: "bottom", x: 0.5, y: 1 },
    { id: "left", x: 0, y: 0.5 },
  ],
  line: [],
  ink: [],
};

export function getPortOffsetsForElement(element: DiagramElement): PortOffset[] {
  if (element.portOffsets && element.portOffsets.length > 0) {
    return element.portOffsets;
  }
  return defaultPortOffsetsByKind[element.kind] ?? [];
}

export function resolveElementPorts(element: DiagramElement): ResolvedPort[] {
  const offsets = getPortOffsetsForElement(element);
  return offsets.map((port) => ({
    ...port,
    absoluteX: element.x + element.width * port.x,
    absoluteY: element.y + element.height * port.y,
  }));
}
