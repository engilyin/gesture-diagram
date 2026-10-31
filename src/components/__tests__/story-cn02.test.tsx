import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";
import type { DiagramDocument } from "../../editor/types";

const sourceId = "shape-source";
const targetId = "shape-target";

const baseDocument: DiagramDocument = {
  version: "0.1.0",
  elements: [
    {
      id: sourceId,
      kind: "rect",
      x: 120,
      y: 120,
      width: 140,
      height: 90,
    },
    {
      id: targetId,
      kind: "rect",
      x: 420,
      y: 120,
      width: 140,
      height: 90,
    },
  ],
};

describe("STORY-CN02 drag-to-connect", () => {
  it("creates connector via port drag, highlights targets, and keeps attachment while moving", async () => {
    const onDocumentChange = vi.fn();
    render(<EditorSurface document={baseDocument} onDocumentChange={onDocumentChange} />);

    const canvas = screen.getByLabelText("Diagram canvas");
    const canvasRect = canvas.getBoundingClientRect();
    const toClient = (x: number, y: number) => ({
      clientX: canvasRect.left + x,
      clientY: canvasRect.top + y,
    });
    fireEvent.mouseMove(canvas, toClient(180, 160));

    const rightPort = screen.getByLabelText("Connection port right");
    fireEvent.pointerDown(rightPort, { button: 0, ...toClient(260, 165) });
    fireEvent.pointerMove(canvas, toClient(490, 165));

    expect(screen.getByLabelText("Connector preview")).toBeInTheDocument();

    fireEvent.pointerUp(canvas, toClient(490, 165));

    let connector:
      | {
          kind: string;
          width: number;
          connector?: { fromId: string; toId: string };
        }
      | undefined;
    await waitFor(() => {
      const latestAfterConnect =
        onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      connector = latestAfterConnect?.elements.find(
        (element: { kind: string }) => element.kind === "line",
      );
      expect(connector).toBeTruthy();
    });
    expect(connector?.connector).toEqual({ fromId: sourceId, toId: targetId });

    const targetShape = screen.getAllByLabelText(/rect shape:/i)[1];
    fireEvent.pointerDown(targetShape, { button: 0, ...toClient(490, 165) });
    fireEvent.pointerMove(canvas, toClient(590, 165));
    fireEvent.pointerUp(canvas, toClient(590, 165));

    await waitFor(() => {
      const latestAfterMove =
        onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
      const movedConnector = latestAfterMove?.elements.find(
        (element: { kind: string }) => element.kind === "line",
      );
      expect(movedConnector?.connector).toEqual({ fromId: sourceId, toId: targetId });
    });
  });
});
