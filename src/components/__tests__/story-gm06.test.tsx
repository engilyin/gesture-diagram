import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-GM06 format painter", () => {
  it("copies style from selected shape and applies it on next clicked shape", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const source = {
      ...createRectangle(80, 80, 120, 90),
      id: "source-shape",
      color: "#b91c1c",
      styleVariant: "dashed" as const,
    };
    const target = {
      ...createRectangle(320, 120, 140, 100),
      id: "target-shape",
      color: "#2563eb",
      styleVariant: "filled" as const,
    };
    const document = createDocument();
    document.elements = [source, target];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        initialSelectionIds={["source-shape"]}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Style" }));
    expect(screen.getByRole("button", { name: "Copy Style (Armed)" })).toBeInTheDocument();

    const targetShape = screen.getAllByLabelText("Shape rect")[1];
    if (!targetShape) {
      return;
    }
    fireEvent.pointerDown(targetShape, { button: 0, clientX: 330, clientY: 130 });
    fireEvent.pointerUp(targetShape, { clientX: 330, clientY: 130 });

    await waitFor(() => {
      const appliedTarget = latestDocument.elements.find((element) => element.id === "target-shape");
      expect(appliedTarget?.color).toBe(source.color);
      expect(appliedTarget?.styleVariant).toBe(source.styleVariant);
    });

    expect(screen.queryByRole("button", { name: "Copy Style (Armed)" })).not.toBeInTheDocument();
  });
});
