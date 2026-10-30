import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-G01 gesture-to-text flows", () => {
  it("opens inline text editing when tapping empty canvas", () => {
    render(<EditorSurface />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 220, clientY: 220 });
    fireEvent.pointerUp(canvas);

    expect(screen.getByLabelText("Edit text element")).toBeInTheDocument();
  });
});
