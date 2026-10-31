import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramDocument } from "../../editor/types";
import { EditorSurface } from "../EditorSurface";

describe("STORY-LY03 layer solo mode", () => {
  it("dims other layers on Alt+visibility click and exits solo mode on next visibility click", async () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");

    const document: DiagramDocument = {
      version: "0.1.0",
      elements: [
        {
          id: "shape-a",
          kind: "rect",
          x: 40,
          y: 40,
          width: 100,
          height: 60,
          layer: 0,
        },
        {
          id: "shape-b",
          kind: "rect",
          x: 220,
          y: 40,
          width: 100,
          height: 60,
          layer: 1,
        },
      ],
      settings: {
        layers: [
          { id: "layer-1", name: "Layer 1", color: "#4f46e5", visible: true, locked: false },
          { id: "layer-2", name: "Layer 2", color: "#2563eb", visible: true, locked: false },
        ],
      },
    };

    const { container } = render(<EditorSurface document={document} />);

    const layerOneVisibility = screen.getByRole("button", {
      name: "Toggle visibility Layer 1",
    });
    const layerTwoVisibility = screen.getByRole("button", {
      name: "Toggle visibility Layer 2",
    });
    const layerOneShape = container.querySelector('[data-element-id="shape-a"]');
    const layerTwoShape = container.querySelector('[data-element-id="shape-b"]');

    expect(layerOneShape).toBeTruthy();
    expect(layerTwoShape).toBeTruthy();
    if (!layerOneShape || !layerTwoShape) {
      return;
    }

    fireEvent.click(layerOneVisibility, { altKey: true });

    await waitFor(() => {
      expect(layerOneShape).toHaveStyle({ opacity: "1" });
      expect(layerTwoShape).toHaveStyle({ opacity: "0.2" });
    });

    fireEvent.click(layerTwoVisibility);

    await waitFor(() => {
      expect(layerOneShape).toHaveStyle({ opacity: "1" });
      expect(layerTwoShape).toHaveStyle({ opacity: "1" });
    });
  });
});
