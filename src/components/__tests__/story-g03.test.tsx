import { fireEvent, render, screen } from "@testing-library/react";
import { createDocument } from "../../editor/document";
import { createRectangle } from "../../editor/shapes";
import { EditorSurface } from "../EditorSurface";

function dismissOnboardingIfPresent() {
  const button = screen.queryByRole("button", { name: "Got it" });
  if (button) {
    fireEvent.click(button);
  }
}

describe("STORY-G03 gesture routing", () => {
  it("starts connector routing from a connection port instead of draw mode", () => {
    const document = createDocument();
    document.elements = [{ ...createRectangle(0, 0, 120, 80), id: "shape-1" }];
    const onDocumentChange = vi.fn();

    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Connection port right" }));

    expect(screen.getByLabelText("Connector preview")).toBeInTheDocument();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerUp(canvas);
    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    expect(latest.elements.length).toBe(1);
  });

  it("routes pointer-down inside an existing shape to move interaction", () => {
    const document = createDocument();
    document.elements = [{ ...createRectangle(0, 0, 120, 80), id: "shape-1" }];
    const onDocumentChange = vi.fn();

    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 8, clientY: 8 });
    fireEvent.pointerMove(canvas, { clientX: 42, clientY: 46 });
    fireEvent.pointerUp(canvas);

    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    expect(latest.elements).toHaveLength(1);
  });

  it("routes pointer-down on empty canvas to shape creation", () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 90, clientY: 90 });
    fireEvent.pointerMove(canvas, { clientX: 170, clientY: 140 });
    fireEvent.pointerUp(canvas);

    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    expect(latest.elements.length).toBeGreaterThanOrEqual(1);
  });
});
