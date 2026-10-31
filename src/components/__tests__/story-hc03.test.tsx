import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createContainer, createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-HC03 container auto-layout controls", () => {
  it("exposes layout actions and supports undo for layout changes", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const container = {
      ...createContainer(200, 120, 300, 240),
      id: "container-1",
      containerLayoutMode: "free" as const,
    };
    const childA = { ...createRectangle(240, 160, 90, 60), id: "child-a", parentId: "container-1" };
    const childB = { ...createRectangle(380, 210, 120, 70), id: "child-b", parentId: "container-1" };

    const document = createDocument();
    document.elements = [container, childA, childB];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        initialSelectionIds={["container-1"]}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Layout: Free ✓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Layout: Row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Layout: Column" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Layout: Grid" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Layout: Row" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Layout: Row ✓" })).toBeInTheDocument();
      const containerState = latestDocument.elements.find((element) => element.id === "container-1");
      expect(containerState?.containerLayoutMode).toBe("row");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      const containerState = latestDocument.elements.find((element) => element.id === "container-1");
      expect(containerState?.containerLayoutMode).toBe("free");
    });
  });
});
