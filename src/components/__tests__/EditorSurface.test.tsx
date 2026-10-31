import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("EditorSurface", () => {
  it("zooms with toolbar buttons", () => {
    render(<EditorSurface />);

    expect(screen.getByText(/Zoom: 1\.00 \| Selected: 0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    expect(screen.getByText(/Zoom: 1\.10 \| Selected: 0/)).toBeInTheDocument();
  });

  it("renders the interactive canvas surface", () => {
    render(<EditorSurface />);
    expect(screen.getByLabelText("Diagram canvas")).toBeInTheDocument();
  });

  it("creates an element through fallback confirmation and exposes context actions", () => {
    render(<EditorSurface />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
    fireEvent.pointerUp(canvas);

    expect(screen.getByText(/Selected: 1/)).toBeInTheDocument();
    expect(
      screen.getByRole("toolbar", { name: "Context actions" }),
    ).toBeInTheDocument();
  });
});
