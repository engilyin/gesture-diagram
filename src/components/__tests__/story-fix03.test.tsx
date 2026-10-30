import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-FIX03 shape types", () => {
  it("lets users choose ellipse from gesture fallback and persists semantic kind", () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 160 });
    fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
    fireEvent.pointerUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Ellipse" }));

    const latestCall = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1];
    const latestDocument = latestCall?.[0];
    expect(latestDocument).toBeTruthy();
    expect(latestDocument.elements.at(-1)?.kind).toBe("ellipse");
  });

  it("starts inline editing when text shape is selected from gesture fallback", () => {
    render(<EditorSurface />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 180, clientY: 180 });
    fireEvent.pointerMove(canvas, { clientX: 260, clientY: 180 });
    fireEvent.pointerMove(canvas, { clientX: 260, clientY: 220 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 220 });
    fireEvent.pointerMove(canvas, { clientX: 184, clientY: 184 });
    fireEvent.pointerUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByLabelText("Edit text element")).toBeInTheDocument();
  });
});
