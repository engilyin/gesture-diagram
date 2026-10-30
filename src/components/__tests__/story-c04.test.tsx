import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

const largeDocument: DiagramDocument = {
  version: "0.1.0",
  elements: [
    { id: "left", kind: "rect", x: 40, y: 40, width: 120, height: 80 },
    { id: "right", kind: "rect", x: 1280, y: 860, width: 180, height: 120 },
  ],
};

describe("STORY-C04 minimap and fit-to-content", () => {
  it("renders minimap and fits viewport to content", async () => {
    render(<EditorSurface document={largeDocument} />);

    expect(screen.getByLabelText("Minimap")).toBeInTheDocument();
    expect(screen.getByLabelText("Viewport indicator")).toBeInTheDocument();
    expect(screen.getByText(/Zoom: 1\.00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fit to Content" }));

    await waitFor(() => {
      expect(screen.queryByText(/Zoom: 1\.00/)).not.toBeInTheDocument();
    });
  });

  it("pans viewport when minimap is used", async () => {
    render(<EditorSurface document={largeDocument} />);

    const viewport = document.querySelector(".viewport") as HTMLDivElement;
    const initialTransform = viewport.style.transform;
    const minimap = screen.getByLabelText("Minimap");

    fireEvent.pointerDown(minimap, { clientX: 190, clientY: 110 });
    fireEvent.pointerMove(minimap, { clientX: 190, clientY: 110 });
    fireEvent.pointerUp(minimap);

    await waitFor(() => {
      expect(viewport.style.transform).not.toBe(initialTransform);
    });
  });
});
