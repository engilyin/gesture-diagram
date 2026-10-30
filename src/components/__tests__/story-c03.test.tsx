import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

function drawAndSelectElement() {
  const canvas = screen.getByLabelText("Diagram canvas");
  fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 180, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 180, clientY: 160 });
  fireEvent.pointerMove(canvas, { clientX: 100, clientY: 160 });
  fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
  fireEvent.pointerUp(canvas);
  fireEvent.click(screen.getByRole("button", { name: "Keep as Ink" }));
}

function latestDocument(changeSpy: ReturnType<typeof vi.fn>): DiagramDocument {
  return changeSpy.mock.calls[changeSpy.mock.calls.length - 1]?.[0] as DiagramDocument;
}

describe("STORY-C03 clipboard operations", () => {
  it("supports copy and paste with offset and new IDs", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);
    drawAndSelectElement();

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    await waitFor(() => {
      const latest = latestDocument(onDocumentChange);
      expect(latest.elements).toHaveLength(2);
      expect(latest.elements[1]?.id).not.toBe(latest.elements[0]?.id);
    });
  });

  it("supports cut, paste, and duplicate shortcuts", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);
    drawAndSelectElement();

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    await waitFor(() => {
      const latest = latestDocument(onDocumentChange);
      expect(latest.elements).toHaveLength(0);
    });

    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    await waitFor(() => {
      const latest = latestDocument(onDocumentChange);
      expect(latest.elements).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    await waitFor(() => {
      const latest = latestDocument(onDocumentChange);
      expect(latest.elements).toHaveLength(2);
      expect(latest.elements[1]?.id).not.toBe(latest.elements[0]?.id);
    });
  });
});
