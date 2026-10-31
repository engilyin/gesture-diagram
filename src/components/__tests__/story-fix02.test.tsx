import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-FIX02 gesture fallback behavior", () => {
  const dismissOnboardingIfPresent = () => {
    const button = screen.queryByRole("button", { name: "Got it" });
    if (button) {
      fireEvent.click(button);
    }
  };

  it("creates a selectable element from plausible non-trivial strokes", () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
    fireEvent.pointerUp(canvas);

    const rectangleOption = screen.queryByRole("button", { name: "Rectangle" });
    if (rectangleOption) {
      fireEvent.click(rectangleOption);
    }

    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const created = latest?.elements[latest.elements.length - 1];
    expect(created).toBeTruthy();
    expect(screen.getByText(/Selected: 1/)).toBeInTheDocument();
  });

  it("keeps trivially short strokes as ink", () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 240, clientY: 240 });
    fireEvent.pointerMove(canvas, { clientX: 248, clientY: 245 });
    fireEvent.pointerUp(canvas);

    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const created = latest?.elements[latest.elements.length - 1];
    expect(created).toBeTruthy();
    expect(created.kind).toBe("ink");
  });
});
