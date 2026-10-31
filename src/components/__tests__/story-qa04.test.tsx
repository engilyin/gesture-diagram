import "../../index.css";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { EditorSurface } from "../EditorSurface";

describe("STORY-QA04 editor visual layout", () => {
  it("renders three-panel layout and toolbar overflow actions", () => {
    window.localStorage.setItem("gd-onboarding-overlay-dismissed", "1");
    render(<EditorSurface />);

    expect(screen.getByLabelText("Left sidebar")).toBeInTheDocument();
    expect(screen.getByLabelText("Properties panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Diagram canvas")).toBeInTheDocument();

    expect(screen.queryByRole("menuitem", { name: "Layout" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Fit to Content" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cheat Sheet" })).toBeInTheDocument();
  });

  it("uses tokenized gizmo sizing and 8px-grid layout styles", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("--gd-size-selection-handle: 16px;");
    expect(css).toContain("--gd-size-rotation-handle: 16px;");
    expect(css).toContain("--gd-size-connection-port: 16px;");
    expect(css).toContain("grid-template-columns: 320px minmax(0, 1fr) 320px;");
    expect(css).toContain("gap: 8px;");
    expect(css).toContain(".selection-handle:hover");
    expect(css).toContain(".connection-port:hover");
  });
});
