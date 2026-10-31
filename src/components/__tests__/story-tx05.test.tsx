import { fireEvent, render, screen, within } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

const initialHeight = 48;
const seededDocument = {
  version: "0.4.0",
  elements: [
    {
      id: "shape-1",
      kind: "rect" as const,
      x: 100,
      y: 100,
      width: 140,
      height: initialHeight,
      text: "",
    },
  ],
};

function openEditor() {
  const shape = screen.getByLabelText("Shape rect");
  fireEvent.dblClick(shape);
  return screen.getByLabelText("Edit text element") as HTMLTextAreaElement;
}

describe("STORY-TX05 text overflow modes", () => {
  it("auto-grows shape height in default grow-shape mode", () => {
    const onDocumentChange = vi.fn();
    render(
      <EditorSurface document={seededDocument} onDocumentChange={onDocumentChange} />,
    );

    const editor = openEditor();
    fireEvent.change(editor, {
      target: {
        value:
          "This is a long label that should wrap across multiple visual lines inside a narrow shape.",
      },
    });
    fireEvent.keyDown(editor, { key: "Enter" });

    const latestDocument =
      onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    expect(latestDocument?.elements?.[0]?.height).toBeGreaterThan(initialHeight);
    expect(latestDocument?.elements?.[0]?.textOverflowMode ?? "grow-shape").toBe(
      "grow-shape",
    );
  });

  it("supports shrink-text mode from palette and reduces rendered font size", () => {
    const onDocumentChange = vi.fn();
    render(
      <EditorSurface document={seededDocument} onDocumentChange={onDocumentChange} />,
    );

    const shape = screen.getByLabelText("Shape rect");
    fireEvent.pointerDown(shape, { button: 0, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(shape, { button: 0, clientX: 140, clientY: 120 });

    fireEvent.click(
      screen.getByRole("button", { name: "Set text overflow shrink-text" }),
    );

    const editor = openEditor();
    fireEvent.change(editor, {
      target: {
        value:
          "Shrink mode keeps shape bounds and scales down text to avoid clipping in tight nodes.",
      },
    });
    fireEvent.keyDown(editor, { key: "Enter" });

    const latestDocument =
      onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    expect(latestDocument?.elements?.[0]?.textOverflowMode).toBe("shrink-text");
    expect(latestDocument?.elements?.[0]?.height).toBe(initialHeight);

    within(shape).getByText(/Shrink mode keeps shape bounds/i);
    const textWrapper = shape.querySelector(
      'div[style*="font-size"]',
    ) as HTMLDivElement | null;
    const fontSize = Number.parseFloat(textWrapper?.style.fontSize ?? "14");
    expect(fontSize).toBeLessThan(14);
  });
});
