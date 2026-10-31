import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDocument } from "../../editor";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-LB01 library panel", () => {
  it("shows categories and places shapes onto canvas through drag-and-drop", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const document = createDocument();
    let latestDocument: DiagramDocument = document;
    render(
      <EditorSurface
        document={document}
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    expect(screen.getByText("Basic Shapes")).toBeInTheDocument();
    expect(screen.getByText("Flowchart")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Library filter"), {
      target: { value: "Decision" },
    });
    const decisionShape = screen.getByRole("button", { name: "Library shape Decision" });
    const canvas = screen.getByLabelText("Diagram canvas");
    const dataTransfer = {
      setData: vi.fn(),
      getData: (type: string) =>
        type === "application/x-gd-library-shape" ? "flow-decision" : "",
      types: ["application/x-gd-library-shape"],
    };

    fireEvent.dragStart(decisionShape, { dataTransfer });
    fireEvent.dragOver(canvas, { dataTransfer });
    fireEvent.drop(canvas, { dataTransfer, clientX: 320, clientY: 240 });

    await waitFor(() => {
      const added = latestDocument.elements.find((element) => element.text === "Decision");
      expect(added?.kind).toBe("diamond");
    });
  });
});
