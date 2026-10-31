import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

const sourceId = "shape-source";

const baseDocument: DiagramDocument = {
  version: "0.1.0",
  elements: [
    {
      id: sourceId,
      kind: "rect",
      x: 120,
      y: 120,
      width: 140,
      height: 90,
    },
  ],
};

describe("STORY-CN03 drag-to-create-target", () => {
  it("creates a placeholder shape on empty drop and allows converting it via palette", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface document={baseDocument} onDocumentChange={onDocumentChange} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.mouseMove(canvas, { clientX: 180, clientY: 160 });

    const rightPort = screen.getByLabelText("Connection port right");
    fireEvent.pointerDown(rightPort, { button: 0, clientX: 260, clientY: 165 });
    fireEvent.pointerMove(canvas, { clientX: 520, clientY: 320 });
    fireEvent.pointerUp(canvas, { clientX: 520, clientY: 320 });

    let placeholderId = "";
    await waitFor(() => {
      const latest =
        onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      const placeholder = latest?.elements.find(
        (element: { id: string; kind: string }) =>
          element.kind === "rect" && element.id !== sourceId,
      );
      const connector = latest?.elements.find(
        (element: { kind: string; connector?: { fromId: string; toId: string } }) =>
          element.kind === "line" && element.connector?.fromId === sourceId,
      );
      expect(placeholder).toBeTruthy();
      expect(connector?.connector?.toId).toBe(placeholder?.id);
      placeholderId = placeholder.id;
      expect(Math.abs(placeholder.x % 16)).toBe(0);
      expect(Math.abs(placeholder.y % 16)).toBe(0);
    });

    expect(
      screen.getByText("Target placeholder created. Use shape options to choose target type."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to Ellipse" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Convert to Ellipse" }));

    await waitFor(() => {
      const latest =
        onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      const converted = latest?.elements.find(
        (element: { id: string; kind: string }) => element.id === placeholderId,
      );
      const connector = latest?.elements.find(
        (element: { kind: string; connector?: { fromId: string; toId: string } }) =>
          element.kind === "line" && element.connector?.fromId === sourceId,
      );
      expect(converted?.kind).toBe("ellipse");
      expect(connector?.connector?.toId).toBe(placeholderId);
    });
  });
});
