import { render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

describe("STORY-CN07 hidden endpoint handling", () => {
  it("hides connectors to hidden-layer endpoints and marks visible endpoint indicators", () => {
    const document: DiagramDocument = {
      version: "0.4.0",
      settings: {
        layers: [
          { id: "visible", name: "Visible", color: "#4f46e5", visible: true, locked: false },
          { id: "hidden", name: "Hidden", color: "#2563eb", visible: false, locked: false },
        ],
      },
      elements: [
        {
          id: "visible-shape",
          kind: "rect",
          x: 100,
          y: 120,
          width: 130,
          height: 80,
          layer: 0,
          text: "Visible",
        },
        {
          id: "hidden-shape",
          kind: "rect",
          x: 380,
          y: 120,
          width: 130,
          height: 80,
          layer: 1,
          text: "Hidden",
        },
        {
          id: "connector",
          kind: "line",
          x: 230,
          y: 160,
          width: 150,
          height: 0,
          layer: 0,
          connector: {
            fromId: "visible-shape",
            toId: "hidden-shape",
          },
        },
      ],
    };

    render(<EditorSurface document={document} />);

    expect(screen.queryByLabelText(/Connector from/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 hidden connection")).toBeInTheDocument();
  });
});
