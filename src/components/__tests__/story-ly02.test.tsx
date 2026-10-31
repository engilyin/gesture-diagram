import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createLine, createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-LY02 send to layer action", () => {
  it("shows Send to Layer actions and preserves connector links after moving shape", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const source = { ...createRectangle(80, 100, 120, 80), id: "shape-source", layer: 0 };
    const target = { ...createRectangle(360, 100, 120, 80), id: "shape-target", layer: 0 };
    const connector = {
      ...createLine(140, 140, 220, 0),
      id: "line-1",
      layer: 0,
      connector: { fromId: "shape-source", toId: "shape-target" },
    };
    const document = createDocument();
    document.elements = [source, target, connector];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        initialSelectionIds={["shape-source"]}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Layer" }));
    const sendToLayerButton = screen.getByRole("button", {
      name: "Send to Layer: Layer 2",
    });
    fireEvent.click(sendToLayerButton);

    await waitFor(() => {
      const moved = latestDocument.elements.find((element) => element.id === "shape-source");
      const preservedConnector = latestDocument.elements.find(
        (element) => element.id === "line-1",
      );
      expect(moved?.layer).toBe(1);
      expect(preservedConnector?.connector?.fromId).toBe("shape-source");
      expect(preservedConnector?.connector?.toId).toBe("shape-target");
    });
  });
});
