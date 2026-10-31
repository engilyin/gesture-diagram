import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

function createFallbackShape(canvas: HTMLElement, shapeName: string) {
  fireEvent.pointerDown(canvas, { button: 0, clientX: 120, clientY: 120 });
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 120 });
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 180 });
  fireEvent.pointerMove(canvas, { clientX: 120, clientY: 180 });
  fireEvent.pointerMove(canvas, { clientX: 126, clientY: 126 });
  fireEvent.pointerUp(canvas);

  fireEvent.click(screen.getByRole("button", { name: shapeName }));
}

describe("STORY-TX01 inline shape text editing", () => {
  it("opens inline text editing for newly created shapes and persists label on Enter", () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    createFallbackShape(canvas, "Rectangle");

    const editor = screen.getByLabelText("Edit text element");
    fireEvent.change(editor, { target: { value: "Service API Gateway" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(screen.queryByLabelText("Edit text element")).not.toBeInTheDocument();
    const label = screen.getByText("Service API Gateway");
    expect(label).toBeInTheDocument();
    expect(label).toHaveStyle("text-align: center");
    expect(label).toHaveStyle("white-space: pre-wrap");

    const lastCall = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1];
    const latestDocument = lastCall?.[0];
    expect(latestDocument?.elements.at(-1)?.text).toBe("Service API Gateway");

    const shapeNode = screen.getByLabelText("Shape rect");
    fireEvent.dblClick(shapeNode);
    expect(screen.getByLabelText("Edit text element")).toBeInTheDocument();
  });
});
