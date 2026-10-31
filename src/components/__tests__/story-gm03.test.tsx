import { fireEvent, render, screen } from "@testing-library/react";
import { createDocument } from "../../editor";
import { deserializeDocument, serializeDocument } from "../../editor/persistence/yamlCodec";
import { createRectangle } from "../../editor/shapes";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-GM03 lock and unlock", () => {
  it("provides lock/unlock actions and blocks move/delete while locked", () => {
    let latestDocument: DiagramDocument = createDocument();
    render(
      <EditorSurface
        onDocumentChange={(nextDocument) => {
          latestDocument = nextDocument;
        }}
      />,
    );

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 180 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 180 });
    fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
    fireEvent.pointerUp(canvas);

    const rectangleChoice = screen.queryByRole("button", { name: "Rectangle" });
    if (rectangleChoice) {
      fireEvent.click(rectangleChoice);
    }

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
    expect(screen.getByLabelText("Locked element")).toBeInTheDocument();

    const documentAfterLock = latestDocument;
    const lockedShape = documentAfterLock.elements.find((element) => element.locked);
    expect(lockedShape).toBeTruthy();
    if (!lockedShape) {
      return;
    }

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: lockedShape.x + 10,
      clientY: lockedShape.y + 10,
    });
    fireEvent.pointerMove(canvas, {
      clientX: lockedShape.x + 140,
      clientY: lockedShape.y + 120,
    });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const finalDocument = latestDocument;
    const sameLockedShape = finalDocument.elements.find((element) => element.id === lockedShape.id);
    expect(sameLockedShape).toBeTruthy();
    expect(sameLockedShape?.x).toBe(lockedShape.x);
    expect(sameLockedShape?.y).toBe(lockedShape.y);
    expect(sameLockedShape?.locked).toBe(true);
  });

  it("persists lock state through YAML round-trip", () => {
    const document = createDocument();
    document.elements.push({
      ...createRectangle(40, 50, 120, 70),
      id: "lock-persist-shape",
      locked: true,
    });

    const yaml = serializeDocument(document, "2026-01-01T00:00:00.000Z");
    const parsed = deserializeDocument(yaml);
    const restored = parsed.elements.find((element) => element.id === "lock-persist-shape");

    expect(restored?.locked).toBe(true);
  });
});
