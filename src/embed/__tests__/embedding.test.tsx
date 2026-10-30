import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { GestureDiagram } from "../react-wrapper";
import { registerGestureDiagramElement } from "../web-component";
import type { GestureDiagramApi } from "../types";

describe("embedding surfaces", () => {
  it("renders react wrapper and exposes api", () => {
    const ref = createRef<GestureDiagramApi>();
    render(<GestureDiagram ref={ref} />);

    expect(screen.getByLabelText("Diagram canvas")).toBeInTheDocument();
    expect(ref.current).toBeTruthy();
    expect(ref.current?.getDocument().version).toBe("0.1.0");
  });

  it("registers custom element once", () => {
    registerGestureDiagramElement();
    registerGestureDiagramElement();

    expect(customElements.get("gesture-diagram")).toBeTruthy();
  });
});
