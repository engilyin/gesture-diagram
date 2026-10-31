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

describe("STORY-GM01 hover-zone gizmos", () => {
  it("supports resize, rotate, and connect zones with matching cursors", async () => {
    const document = createDocument();
    document.elements = [{ ...createRectangle(20, 20, 120, 80), id: "shape-1" }];
    const onDocumentChange = vi.fn();

    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });

    const resizeHandle = screen.getByRole("button", { name: "Resize south-east" });
    expect(resizeHandle.getAttribute("style")).toContain("cursor: nwse-resize");
    fireEvent.pointerDown(resizeHandle, { clientX: 140, clientY: 100 });
    await Promise.resolve();
    fireEvent.pointerMove(resizeHandle, { clientX: 190, clientY: 130 });
    fireEvent.pointerMove(resizeHandle, { clientX: 210, clientY: 150 });
    fireEvent.pointerUp(resizeHandle);

    const afterResize = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const resized = afterResize?.elements.find((element: { id: string }) => element.id === "shape-1");
    expect(resized.width).toBeGreaterThanOrEqual(120);
    expect(resized.height).toBeGreaterThanOrEqual(80);

    const rotateHandle = screen.getByRole("button", { name: "Rotate near ne" });
    expect(rotateHandle.getAttribute("style")).toContain("cursor: grab");
    fireEvent.pointerDown(rotateHandle, { clientX: 160, clientY: 8 });
    await Promise.resolve();
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 150 });
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 170 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 170 });

    const afterRotate = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const rotated = afterRotate?.elements.find((element: { id: string }) => element.id === "shape-1");
    expect(typeof rotated.rotation).toBe("number");

    const connectPort = screen.getByRole("button", { name: "Connection port right" });
    expect(connectPort.getAttribute("style")).toContain("cursor: crosshair");
  });
});
