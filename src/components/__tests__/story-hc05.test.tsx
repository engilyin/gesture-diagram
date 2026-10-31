import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createContainer, createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-HC05 outline panel", () => {
  it("supports outline selection, filtering, reparenting, and visibility toggles", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const container = { ...createContainer(120, 100, 280, 200), id: "container-1" };
    const childOne = { ...createRectangle(160, 160, 100, 70), id: "child-1" };
    const childTwo = { ...createRectangle(420, 210, 110, 80), id: "child-2" };

    const document = createDocument();
    document.elements = [container, childOne, childTwo];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select child-1 in outline"));
    expect(screen.getByText(/Selected:\s*1/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Outline filter"), {
      target: { value: "child-2" },
    });
    expect(screen.queryByLabelText("Select child-1 in outline")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select child-2 in outline")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Outline filter"), {
      target: { value: "" },
    });

    const childTwoRow = screen.getByLabelText("Select child-2 in outline").closest("li");
    const childOneRow = screen.getByLabelText("Select child-1 in outline").closest("li");
    if (!childTwoRow || !childOneRow) {
      throw new Error("outline rows not found");
    }
    fireEvent.dragStart(childTwoRow);
    fireEvent.dragOver(childOneRow);
    fireEvent.drop(childOneRow);

    await waitFor(() => {
      const orderedIds = latestDocument.elements.map((element) => element.id);
      expect(orderedIds.indexOf("child-2")).toBeLessThan(orderedIds.indexOf("child-1"));
    });

    expect(screen.getAllByLabelText("Shape rect")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Toggle visibility for child-1"));

    await waitFor(() => {
      expect(screen.getAllByLabelText("Shape rect")).toHaveLength(1);
      const child = latestDocument.elements.find((element) => element.id === "child-1");
      expect(child?.hidden).toBe(true);
    });
  });
});
