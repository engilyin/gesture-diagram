import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-A11Y01 keyboard-first editing", () => {
  it("creates a rectangle with keyboard shortcut", () => {
    render(<EditorSurface />);

    fireEvent.keyDown(window, { key: "n" });

    expect(screen.getByText(/Selected: 1/)).toBeInTheDocument();
    expect(screen.getByLabelText("Shape rect")).toBeInTheDocument();
    expect(screen.getByText("Created rectangle with keyboard.")).toBeInTheDocument();
  });

  it("opens inline editing from keyboard Enter on selected shape", () => {
    render(
      <EditorSurface
        document={{
          version: "0.4.0",
          elements: [
            {
              id: "shape-1",
              kind: "rect",
              x: 100,
              y: 100,
              width: 180,
              height: 96,
              text: "",
            },
          ],
        }}
      />,
    );

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(screen.getByLabelText("Edit text element")).toBeInTheDocument();
  });

  it("creates a connector fully from keyboard selection flow", () => {
    const onDocumentChange = vi.fn();
    render(
      <EditorSurface
        onDocumentChange={onDocumentChange}
        document={{
          version: "0.4.0",
          elements: [
            {
              id: "a",
              kind: "rect",
              x: 100,
              y: 100,
              width: 160,
              height: 90,
              text: "A",
            },
            {
              id: "b",
              kind: "rect",
              x: 420,
              y: 100,
              width: 160,
              height: 90,
              text: "B",
            },
          ],
        }}
      />,
    );

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.keyDown(window, { key: "k" });

    expect(screen.getByLabelText("Connector")).toBeInTheDocument();
    const latestDocument =
      onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const connector = latestDocument?.elements?.find(
      (element: { kind?: string; connector?: { fromId?: string; toId?: string } }) =>
        element.kind === "line" && element.connector,
    );
    expect(connector?.connector?.fromId).toBe("a");
    expect(connector?.connector?.toId).toBe("b");
  });
});
