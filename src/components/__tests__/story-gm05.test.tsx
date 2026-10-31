import { fireEvent, render, screen } from "@testing-library/react";
import { createDocument } from "../../editor";
import { createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

function centerSpacing(elements: Array<{ x: number; width: number }>): [number, number] {
  const centers = elements.map((element) => element.x + element.width / 2).sort((a, b) => a - b);
  return [centers[1] - centers[0], centers[2] - centers[1]];
}

describe("STORY-GM05 multi-selection tools", () => {
  it("shows arrange actions for multi-select and applies undoable atomic operations", () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const document = createDocument();
    document.elements = [
      { ...createRectangle(80, 80, 90, 70), id: "shape-a", groupId: "group-1" },
      { ...createRectangle(260, 140, 140, 110), id: "shape-b", groupId: "group-1" },
      { ...createRectangle(500, 220, 110, 90), id: "shape-c", groupId: "group-1" },
    ];

    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        initialSelectionIds={["shape-a", "shape-b", "shape-c"]}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    [
      "Align Left",
      "Align Center",
      "Align Right",
      "Align Top",
      "Align Middle",
      "Align Bottom",
      "Distribute Horizontal",
      "Distribute Vertical",
      "Match Width",
      "Match Height",
    ].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Distribute Horizontal" }));
    const afterDistribute = latestDocument.elements.filter((element) =>
      ["shape-a", "shape-b", "shape-c"].includes(element.id),
    );
    const [firstGap, secondGap] = centerSpacing(afterDistribute);
    expect(Math.abs(firstGap - secondGap)).toBeLessThan(0.1);

    fireEvent.click(screen.getByRole("button", { name: "Match Height" }));
    const afterMatchHeight = latestDocument.elements.filter((element) =>
      ["shape-a", "shape-b", "shape-c"].includes(element.id),
    );
    const expectedHeight = afterMatchHeight.find((element) => element.id === "shape-a")?.height;
    expect(expectedHeight).toBeTruthy();
    afterMatchHeight.forEach((element) => {
      expect(element.height).toBe(expectedHeight);
    });

    fireEvent.click(screen.getByRole("button", { name: "Align Left" }));
    const afterAlign = latestDocument.elements.filter((element) =>
      ["shape-a", "shape-b", "shape-c"].includes(element.id),
    );
    const leftEdges = afterAlign.map((element) => element.x);
    expect(new Set(leftEdges).size).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const afterUndo = latestDocument.elements.filter((element) =>
      ["shape-a", "shape-b", "shape-c"].includes(element.id),
    );
    const undoLeftEdges = afterUndo.map((element) => element.x);
    expect(new Set(undoLeftEdges).size).toBeGreaterThan(1);
  });
});
