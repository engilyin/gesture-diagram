import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

describe("STORY-A11Y02 screen-reader semantics", () => {
  it("exposes accessible labels for shapes and connectors plus canvas summary", () => {
    render(
      <EditorSurface
        document={{
          version: "0.4.0",
          elements: [
            {
              id: "shape-a",
              kind: "rect",
              x: 100,
              y: 100,
              width: 180,
              height: 100,
              text: "Service",
            },
            {
              id: "shape-b",
              kind: "rect",
              x: 420,
              y: 100,
              width: 180,
              height: 100,
              text: "Database",
            },
            {
              id: "connector-1",
              kind: "line",
              x: 280,
              y: 150,
              width: 140,
              height: 4,
              connector: {
                fromId: "shape-a",
                toId: "shape-b",
              },
            },
          ],
        }}
      />,
    );

    const canvas = screen.getByRole("region", { name: "Diagram canvas" });
    expect(canvas).toHaveAttribute("aria-describedby", "diagram-screen-reader-summary");
    expect(screen.getByLabelText("rect shape: Service")).toBeInTheDocument();
    expect(screen.getByLabelText("rect shape: Database")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Connector from Service to Database"),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 shapes\. 1 connectors\. selection size 0\./i)).toBeInTheDocument();

    fireEvent.pointerDown(canvas, { button: 0, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 140, clientY: 140 });

    expect(screen.getByText(/selection size 1\./i)).toBeInTheDocument();
  });
});
