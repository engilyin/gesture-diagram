import { render, screen } from "@testing-library/react";
import { ContextPalette } from "../ContextPalette";

describe("ContextPalette", () => {
  it("renders ranked actions in order", () => {
    render(
      <ContextPalette
        actions={[
          { id: "delete", label: "Delete", kind: "delete", rank: 3 },
          { id: "convert", label: "Convert", kind: "convert", rank: 1 },
          { id: "duplicate", label: "Duplicate", kind: "duplicate", rank: 2 },
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Convert",
      "Duplicate",
      "Delete",
    ]);
  });

  it("exposes toolbar semantics for keyboard interaction", () => {
    render(
      <ContextPalette
        actions={[
          { id: "convert", label: "Convert", kind: "convert", rank: 1 },
        ]}
      />,
    );

    expect(
      screen.getByRole("toolbar", { name: "Context actions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
  });

  it("applies profile-based action prioritization", () => {
    render(
      <ContextPalette
        profileId="architecture-default"
        actions={[
          { id: "delete", label: "Delete", kind: "delete", rank: 1 },
          { id: "group", label: "Group", kind: "group", rank: 2 },
          { id: "convert", label: "Convert", kind: "convert", rank: 3 },
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Convert",
      "Group",
      "Delete",
    ]);
  });
});
