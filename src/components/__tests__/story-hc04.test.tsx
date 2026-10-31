import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { COLLAPSED_CONTAINER_HEIGHT } from "../../editor/grouping";
import { createContainer, createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-HC04 container collapse UI", () => {
  it("collapses and expands a container via the header toggle", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const container = { ...createContainer(180, 100, 320, 240), id: "container-1" };
    const child = {
      ...createRectangle(220, 160, 120, 80),
      id: "child-1",
      parentId: "container-1",
    };

    const document = createDocument();
    document.elements = [container, child];

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

    expect(screen.getByLabelText("Shape rect")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse container" }));

    await waitFor(() => {
      const containerState = latestDocument.elements.find((element) => element.id === "container-1");
      expect(containerState?.collapsed).toBe(true);
      expect(containerState?.height).toBe(COLLAPSED_CONTAINER_HEIGHT);
      expect(screen.queryByLabelText("Shape rect")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Expand container" }));

    await waitFor(() => {
      const containerState = latestDocument.elements.find((element) => element.id === "container-1");
      expect(containerState?.collapsed).toBe(false);
      expect(screen.getByLabelText("Shape rect")).toBeInTheDocument();
    });
  });
});
