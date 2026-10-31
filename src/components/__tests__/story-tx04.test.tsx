import { fireEvent, render, screen, within } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

const seededDocument = {
  version: "0.4.0",
  elements: [
    {
      id: "shape-1",
      kind: "rect" as const,
      x: 100,
      y: 100,
      width: 220,
      height: 120,
      text: "",
    },
  ],
};

function openTextEditor() {
  const shape = screen.getByLabelText("Shape rect");
  fireEvent.dblClick(shape);
  return screen.getByLabelText("Edit text element") as HTMLTextAreaElement;
}

describe("STORY-TX04 rich text editing", () => {
  it("supports ctrl/cmd shortcuts for bold, italic and links while editing text", () => {
    const onDocumentChange = vi.fn();
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("https://example.com/docs");
    render(
      <EditorSurface document={seededDocument} onDocumentChange={onDocumentChange} />,
    );

    const activeEditor = openTextEditor();
    fireEvent.change(activeEditor, { target: { value: "Hello" } });
    activeEditor.setSelectionRange(0, 5);
    fireEvent.keyDown(activeEditor, { key: "b", ctrlKey: true });
    expect(activeEditor.value).toBe("**Hello**");

    fireEvent.change(activeEditor, { target: { value: "world" } });
    activeEditor.setSelectionRange(0, 5);
    fireEvent.keyDown(activeEditor, { key: "i", ctrlKey: true });
    expect(activeEditor.value).toBe("*world*");

    fireEvent.change(activeEditor, { target: { value: "Docs" } });
    activeEditor.setSelectionRange(0, 4);
    fireEvent.keyDown(activeEditor, { key: "k", ctrlKey: true });
    expect(activeEditor.value).toContain("[Docs](https://example.com/docs)");
    expect(promptSpy).toHaveBeenCalled();

    fireEvent.keyDown(activeEditor, { key: "Enter" });

    const shape = screen.getByLabelText("Shape rect");
    const link = within(shape).getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");

    const lastCall = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1];
    const latestDocument = lastCall?.[0];
    expect(latestDocument?.elements.at(-1)?.text).toContain(
      "[Docs](https://example.com/docs)",
    );

    promptSpy.mockRestore();
  });

  it("renders serialized markdown-style formatting from loaded documents", () => {
    render(
      <EditorSurface
        document={{
          ...seededDocument,
          elements: seededDocument.elements.map((element) => ({
            ...element,
            text: "**Bold** *Italic* [Docs](https://example.com)",
          })),
        }}
      />,
    );

    const shape = screen.getByLabelText("Shape rect");
    expect(within(shape).getByText("Bold").tagName.toLowerCase()).toBe("strong");
    expect(within(shape).getByText("Italic").tagName.toLowerCase()).toBe("em");
    expect(within(shape).getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });
});
