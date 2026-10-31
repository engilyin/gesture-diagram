import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

describe("STORY-LY01 layer panel", () => {
  it("creates, renames, reorders, and toggles layer controls", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Layer" }));
    fireEvent.change(screen.getByLabelText("Layer name 2"), {
      target: { value: "Annotations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Toggle visibility Annotations" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle lock Annotations" }));

    const source = screen.getByLabelText("Select Annotations").closest("li");
    const target = screen.getByLabelText("Select Layer 1").closest("li");
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    if (source && target) {
      fireEvent.dragStart(source);
      fireEvent.dragOver(target);
      fireEvent.drop(target);
    }

    await waitFor(() => {
      const latest = onDocumentChange.mock.calls[
        onDocumentChange.mock.calls.length - 1
      ]?.[0] as DiagramDocument | undefined;
      const layers = latest?.settings?.layers ?? [];
      expect(layers).toHaveLength(2);
      expect(layers[0]?.name).toBe("Annotations");
      expect(layers[0]?.visible).toBe(false);
      expect(layers[0]?.locked).toBe(true);
    });
  });

  it("confirms before deleting layer with content and reassigns elements", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    const document: DiagramDocument = {
      version: "0.1.0",
      elements: [
        {
          id: "shape-1",
          kind: "rect",
          x: 20,
          y: 20,
          width: 120,
          height: 80,
          layer: 1,
        },
      ],
      settings: {
        layers: [
          { id: "layer-1", name: "Layer 1", color: "#4f46e5", visible: true, locked: false },
          { id: "layer-2", name: "Layer 2", color: "#2563eb", visible: true, locked: false },
        ],
      },
    };
    const onDocumentChange = vi.fn();
    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Layer 2" }));

    await waitFor(() => {
      const latest = onDocumentChange.mock.calls[
        onDocumentChange.mock.calls.length - 1
      ]?.[0] as DiagramDocument | undefined;
      expect(confirmMock).toHaveBeenCalled();
      expect(latest?.settings?.layers).toHaveLength(1);
      expect(latest?.elements[0]?.layer).toBe(0);
    });

    confirmMock.mockRestore();
  });
});
