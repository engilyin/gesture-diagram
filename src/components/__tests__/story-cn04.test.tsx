import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-CN04 connector routing palette", () => {
  it("allows configuring connector routing mode from the context palette", async () => {
    const onDocumentChange = vi.fn();
    render(
      <EditorSurface
        onDocumentChange={onDocumentChange}
        document={{
          version: "0.4.0",
          elements: [
            {
              id: "a",
              kind: "rect",
              x: 120,
              y: 120,
              width: 140,
              height: 90,
              text: "A",
            },
            {
              id: "b",
              kind: "rect",
              x: 420,
              y: 120,
              width: 140,
              height: 90,
              text: "B",
            },
            {
              id: "c",
              kind: "line",
              x: 260,
              y: 165,
              width: 160,
              height: 2,
              connector: { fromId: "a", toId: "b" },
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select c in outline" }));

    fireEvent.click(screen.getByRole("button", { name: "Set connector routing orthogonal" }));

    await waitFor(() => {
      const latestDocument =
        onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      const updatedConnector = latestDocument?.elements.find(
        (element: { id: string }) => element.id === "c",
      );
      expect(updatedConnector?.connectorRouting).toBe("orthogonal");
      expect(updatedConnector?.points?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  });
});
