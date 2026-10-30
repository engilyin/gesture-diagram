import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

function drawAndKeepInk() {
  const canvas = screen.getByLabelText("Diagram canvas");
  fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 180, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 180, clientY: 160 });
  fireEvent.pointerMove(canvas, { clientX: 100, clientY: 160 });
  fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
  fireEvent.pointerUp(canvas);
  fireEvent.click(screen.getByRole("button", { name: "Keep as Ink" }));
}

describe("STORY-C01 undo/redo", () => {
  it("supports Ctrl+Z and Ctrl+Y keyboard shortcuts", () => {
    const { container } = render(<EditorSurface />);
    drawAndKeepInk();

    expect(container.querySelectorAll("polyline")).toHaveLength(1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("polyline")).toHaveLength(0);

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("enables and disables toolbar undo/redo buttons based on history state", () => {
    const { container } = render(<EditorSurface />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });

    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    drawAndKeepInk();
    expect(undo).toBeEnabled();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);

    fireEvent.click(undo);
    expect(redo).toBeEnabled();
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });
});
