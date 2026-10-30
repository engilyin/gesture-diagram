import "../../index.css";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EditorSurface } from "../EditorSurface";

describe("STORY-EMB01 theming", () => {
  it("defines custom properties with dark mode selectors in stylesheet output", async () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("--gd-font-family");
    expect(css).toContain("--gd-space-2");
    expect(css).toContain("--gd-radius-lg");
    expect(css).toContain("--gd-color-toolbar-bg");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("uses CSS custom properties in runtime editor styles", () => {
    render(<EditorSurface />);
    const minimap = screen.getByLabelText("Minimap");
    expect(minimap).toHaveStyle({
      background: "var(--gd-minimap-bg, rgba(17, 24, 39, 0.78))",
    });
  });
});
