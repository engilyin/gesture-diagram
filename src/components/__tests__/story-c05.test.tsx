import { act, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";
import {
  getCycledSelectionId,
  nudgeSelectedElements,
} from "../../editor/keyboardNavigation";

const documentWithTwoShapes: DiagramDocument = {
  version: "0.1.0",
  elements: [
    { id: "a", kind: "rect", x: 50, y: 50, width: 100, height: 80 },
    { id: "b", kind: "rect", x: 400, y: 50, width: 120, height: 90 },
  ],
};

function dispatchPointer(
  target: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: {
    clientX?: number;
    clientY?: number;
    button?: number;
    pointerType?: string;
  },
) {
  const event = new Event(type, { bubbles: true }) as Event & {
    clientX: number;
    clientY: number;
    button: number;
    pointerType: string;
  };
  event.clientX = init.clientX ?? 0;
  event.clientY = init.clientY ?? 0;
  event.button = init.button ?? 0;
  event.pointerType = init.pointerType ?? "mouse";
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("STORY-C05 marquee and keyboard navigation", () => {
  const mockCanvasRect = () =>
    vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 1600,
            bottom: 1000,
            width: 1600,
            height: 1000,
            toJSON: () => ({}),
          }) as DOMRect,
      );

  it("selects fully enclosed shapes with marquee drag", async () => {
    const rectMock = mockCanvasRect();
    render(<EditorSurface document={documentWithTwoShapes} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    dispatchPointer(canvas as HTMLElement, "pointerdown", {
      button: 0,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
    });
    dispatchPointer(canvas as HTMLElement, "pointermove", {
      pointerType: "mouse",
      clientX: 220,
      clientY: 190,
    });
    dispatchPointer(canvas as HTMLElement, "pointerup", {
      pointerType: "mouse",
      clientX: 220,
      clientY: 190,
    });
    const summary = screen.getByText(/Zoom:/);

    await waitFor(() => {
      expect(summary.textContent).toContain("Selected: 1");
    });
    rectMock.mockRestore();
  });

  it("cycles shape focus order and nudges selection by configured steps", () => {
    const firstId = getCycledSelectionId(documentWithTwoShapes.elements, undefined, 1);
    expect(firstId).toBe("a");

    const secondId = getCycledSelectionId(documentWithTwoShapes.elements, firstId ?? undefined, 1);
    expect(secondId).toBe("b");

    const wrappedId = getCycledSelectionId(documentWithTwoShapes.elements, secondId ?? undefined, 1);
    expect(wrappedId).toBe("a");

    const nudged = nudgeSelectedElements(documentWithTwoShapes.elements, ["a"], 16, 64);
    const moved = nudged.find((element) => element.id === "a");
    expect(moved?.x).toBe(66);
    expect(moved?.y).toBe(114);
  });
});
