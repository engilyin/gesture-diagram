import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

describe("STORY-DM02 style token behavior", () => {
  it("updates tokenized shape styling when token values change", async () => {
    const onDocumentChange = vi.fn();
    const document: DiagramDocument = {
      version: "0.4.0",
      settings: {
        styleTokens: [
          { id: "primary", name: "Primary", color: "#ff0000", strokeWidth: 4, fontSize: 18 },
        ],
      },
      elements: [
        {
          id: "shape-a",
          kind: "rect",
          x: 80,
          y: 80,
          width: 180,
          height: 100,
          text: "Token shape",
          styleTokenId: "primary",
        },
      ],
    };

    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);

    const shape = screen.getByLabelText("rect shape: Token shape");
    expect(shape).toHaveStyle({ borderColor: "#ff0000" });

    fireEvent.change(screen.getByLabelText("Style token color Primary"), {
      target: { value: "#00ff00" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("rect shape: Token shape")).toHaveStyle({
        borderColor: "#00ff00",
      });
      const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      expect(latest?.settings?.styleTokens?.[0]?.color).toBe("#00ff00");
      expect(latest?.elements?.[0]?.styleTokenId).toBe("primary");
    });
  });
});
