import { describe, expect, it } from "vitest";
import { resolveElementPorts } from "../ports";
import type { DiagramElement } from "../types";

describe("ports", () => {
  it("resolves default midpoint ports for a rectangle", () => {
    const element: DiagramElement = {
      id: "r1",
      kind: "rect",
      x: 100,
      y: 200,
      width: 80,
      height: 40,
    };

    const ports = resolveElementPorts(element);
    expect(ports).toHaveLength(4);
    expect(ports.map((port) => port.id)).toEqual(["top", "right", "bottom", "left"]);
    expect(ports[0]).toMatchObject({ absoluteX: 140, absoluteY: 200 });
    expect(ports[1]).toMatchObject({ absoluteX: 180, absoluteY: 220 });
    expect(ports[2]).toMatchObject({ absoluteX: 140, absoluteY: 240 });
    expect(ports[3]).toMatchObject({ absoluteX: 100, absoluteY: 220 });
  });

  it("uses per-shape port overrides when provided", () => {
    const element: DiagramElement = {
      id: "custom",
      kind: "rect",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      portOffsets: [{ id: "top", x: 0.25, y: 0.1 }],
    };

    const ports = resolveElementPorts(element);
    expect(ports).toHaveLength(1);
    expect(ports[0]).toMatchObject({ id: "top", absoluteX: 35, absoluteY: 30 });
  });
});
