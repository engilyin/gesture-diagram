import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createLine, createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-HC06 global auto-layout", () => {
  it("opens layout dialog, applies layout while preserving locked elements, and supports undo", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const nodeA = { ...createRectangle(80, 120, 100, 70), id: "node-a" };
    const nodeB = { ...createRectangle(360, 120, 100, 70), id: "node-b" };
    const lockedNode = {
      ...createRectangle(640, 120, 100, 70),
      id: "node-locked",
      locked: true,
    };
    const connector = {
      ...createLine(130, 155, 280, 12),
      id: "line-1",
      connector: {
        fromId: "node-a",
        toId: "node-b",
      },
    };

    const document = createDocument();
    document.elements = [nodeA, nodeB, lockedNode, connector];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Layout" }));
    expect(screen.getByRole("dialog", { name: "Layout dialog" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));

    await waitFor(() => {
      const movedA = latestDocument.elements.find((element) => element.id === "node-a");
      const movedB = latestDocument.elements.find((element) => element.id === "node-b");
      const stillLocked = latestDocument.elements.find((element) => element.id === "node-locked");
      const movedConnector = latestDocument.elements.find((element) => element.id === "line-1");
      expect(
        (movedA?.x !== nodeA.x) ||
          (movedA?.y !== nodeA.y) ||
          (movedB?.x !== nodeB.x) ||
          (movedB?.y !== nodeB.y),
      ).toBe(true);
      expect(stillLocked?.x).toBe(lockedNode.x);
      expect(stillLocked?.y).toBe(lockedNode.y);
      expect(movedConnector?.width).not.toBe(connector.width);
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      const restoredA = latestDocument.elements.find((element) => element.id === "node-a");
      const restoredB = latestDocument.elements.find((element) => element.id === "node-b");
      const restoredConnector = latestDocument.elements.find((element) => element.id === "line-1");
      expect(restoredA?.x).toBe(nodeA.x);
      expect(restoredA?.y).toBe(nodeA.y);
      expect(restoredB?.x).toBe(nodeB.x);
      expect(restoredB?.y).toBe(nodeB.y);
      expect(restoredConnector?.width).toBe(connector.width);
    });
  });
});
