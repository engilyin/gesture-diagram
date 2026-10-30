import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

const documentWithShape: DiagramDocument = {
  version: "0.1.0",
  elements: [
    {
      id: "shape-1",
      kind: "rect",
      x: 120,
      y: 120,
      width: 160,
      height: 100,
    },
  ],
};

describe("STORY-CN01 hover ports", () => {
  it("shows four connection ports on shape hover with touch-target sizing", () => {
    render(<EditorSurface document={documentWithShape} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.mouseMove(canvas, { clientX: 160, clientY: 160 });

    const ports = [
      screen.getByLabelText("Connection port top"),
      screen.getByLabelText("Connection port right"),
      screen.getByLabelText("Connection port bottom"),
      screen.getByLabelText("Connection port left"),
    ];

    expect(ports).toHaveLength(4);
    for (const port of ports) {
      expect(port).toHaveClass("connection-port");
      expect(Number.parseFloat((port as HTMLDivElement).style.width)).toBeGreaterThanOrEqual(12);
      expect(Number.parseFloat((port as HTMLDivElement).style.height)).toBeGreaterThanOrEqual(12);
    }
  });
});
