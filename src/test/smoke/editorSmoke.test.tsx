import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorSurface } from "../../components/EditorSurface";
import { getBrowserStorageKey } from "../../editor/persistence/browserStorage";
import { deserializeDocument } from "../../editor/persistence/yamlCodec";

describe("editor smoke", () => {
  it("supports create, save, reopen, and export core flow", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLSpy = vi.fn(() => "blob:smoke");
    const revokeObjectURLSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLSpy,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLSpy,
      configurable: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(<EditorSurface />);

    const canvas = screen.getByLabelText("Diagram canvas");
    drawRectangleStroke(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Keep as Ink" }));
    expect(screen.getByText(/Selected: 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved document to browser storage.");

    const stored = localStorage.getItem(getBrowserStorageKey());
    expect(stored).not.toBeNull();
    const savedDocument = deserializeDocument(stored ?? "");
    expect(savedDocument.elements.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText("Loaded document from browser storage.");

      fireEvent.click(screen.getByRole("button", { name: "Export YAML" }));
      await screen.findByText("Exported YAML file.");
      expect(createObjectURLSpy).toHaveBeenCalled();
    } finally {
      clickSpy.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        value: originalCreateObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: originalRevokeObjectURL,
        configurable: true,
      });
    }
  });
});

function drawRectangleStroke(canvas: HTMLElement): void {
  fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100 });
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 170 });
  fireEvent.pointerMove(canvas, { clientX: 100, clientY: 170 });
  fireEvent.pointerMove(canvas, { clientX: 104, clientY: 104 });
  fireEvent.pointerUp(canvas);
}
