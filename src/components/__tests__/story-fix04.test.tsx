import { fireEvent, render, screen } from "@testing-library/react";
import { createDocument } from "../../editor/document";
import { createLine, createRectangle } from "../../editor/shapes";
import { EditorSurface } from "../EditorSurface";

function dismissOnboardingIfPresent() {
  const button = screen.queryByRole("button", { name: "Got it" });
  if (button) {
    fireEvent.click(button);
  }
}

describe("STORY-FIX04 context palette customizer", () => {
  it("supports convert, color, style toggles while keeping secondary actions", () => {
    const document = createDocument();
    const source = { ...createRectangle(20, 20, 120, 70), id: "shape-source", text: "Step" };
    const target = { ...createRectangle(260, 20, 120, 70), id: "shape-target" };
    const connector = {
      ...createLine(140, 55, 120, 1),
      id: "line-1",
      connector: { fromId: source.id, toId: target.id },
    };
    document.elements = [source, target, connector];

    const onDocumentChange = vi.fn();
    render(<EditorSurface document={document} onDocumentChange={onDocumentChange} />);
    dismissOnboardingIfPresent();

    fireEvent.keyDown(window, { key: "Tab" });

    const palette = screen.getByRole("toolbar", { name: "Context actions" });
    expect(palette).toHaveStyle({ position: "absolute" });
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to Diamond" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Convert to Diamond" }));
    fireEvent.click(screen.getByRole("button", { name: "Set color #b91c1c" }));
    fireEvent.click(screen.getByRole("button", { name: "Set dashed style" }));

    const latest = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1]?.[0];
    const converted = latest?.elements.find((element: { id: string }) => element.id === source.id);
    const line = latest?.elements.find((element: { id: string }) => element.id === connector.id);
    const hasDashedStyle = onDocumentChange.mock.calls.some((call) => {
      const candidate = call[0]?.elements.find((element: { id: string }) => element.id === source.id);
      return candidate?.styleVariant === "dashed";
    });
    expect(converted).toMatchObject({
      id: source.id,
      kind: "diamond",
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      text: source.text,
      color: "#b91c1c",
    });
    expect(hasDashedStyle).toBe(true);
    expect(line?.connector).toEqual({
      fromId: source.id,
      toId: target.id,
    });
  });
});
