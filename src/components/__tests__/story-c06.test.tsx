import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

const baseDocument: DiagramDocument = {
  version: "0.1.0",
  elements: [],
};

describe("STORY-C06 document settings", () => {
  it("updates document title, background, and canvas hints from the settings panel", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface document={baseDocument} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText("Document title"), {
      target: { value: "Sprint architecture" },
    });
    fireEvent.change(screen.getByLabelText("Document background color"), {
      target: { value: "#f1f5f9" },
    });
    fireEvent.change(screen.getByLabelText("Canvas width hint"), {
      target: { value: "1440" },
    });
    fireEvent.change(screen.getByLabelText("Canvas height hint"), {
      target: { value: "900" },
    });

    await waitFor(() => {
      const latest = onDocumentChange.mock.calls[
        onDocumentChange.mock.calls.length - 1
      ]?.[0] as DiagramDocument | undefined;
      expect(latest?.settings).toEqual({
        title: "Sprint architecture",
        background: "#f1f5f9",
        canvas: {
          width: 1440,
          height: 900,
        },
      });
    });
  });
});
