import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-TX02 text alignment controls", () => {
  it("exposes horizontal and vertical text alignment options in the palette", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const shape = { ...createRectangle(80, 80, 160, 96), id: "shape-text", text: "Label" };
    const document = createDocument();
    document.elements = [shape];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        initialSelectionIds={["shape-text"]}
        onDocumentChange={(next) => {
          latestDocument = next;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set text horizontal left" }));
    fireEvent.click(screen.getByRole("button", { name: "Set text vertical top" }));

    await waitFor(() => {
      const updated = latestDocument.elements.find((element) => element.id === "shape-text");
      expect(updated?.textAlignHorizontal).toBe("left");
      expect(updated?.textAlignVertical).toBe("top");
    });
  });

  it("aligns text based on click position inside a selected shape", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const shape = {
      ...createRectangle(80, 80, 160, 96),
      id: "shape-click-align",
      text: "Corner",
      textAlignHorizontal: "center" as const,
      textAlignVertical: "middle" as const,
    };
    const document = createDocument();
    document.elements = [shape];

    let latestDocument: DiagramDocument = document;
    const { container } = render(
      <EditorSurface
        document={document}
        initialSelectionIds={["shape-click-align"]}
        onDocumentChange={(next) => {
          latestDocument = next;
        }}
      />,
    );

    const shapeNode = container.querySelector('[data-element-id="shape-click-align"]');
    expect(shapeNode).toBeTruthy();
    if (!shapeNode) {
      return;
    }

    fireEvent.pointerDown(shapeNode, { button: 0, clientX: 0, clientY: 0 });

    await waitFor(() => {
      const updated = latestDocument.elements.find((element) => element.id === "shape-click-align");
      expect(updated?.textAlignHorizontal).toBe("left");
      expect(updated?.textAlignVertical).toBe("top");
    });
  });
});
