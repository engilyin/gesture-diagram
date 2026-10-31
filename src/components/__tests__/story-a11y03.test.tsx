import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

const dismissedKey = "gd-onboarding-overlay-dismissed";

describe("STORY-A11Y03 onboarding cheat-sheet overlay", () => {
  beforeEach(() => {
    window.localStorage.removeItem(dismissedKey);
  });

  it("is opened from toolbar and shows onboarding guidance", () => {
    render(<EditorSurface />);

    expect(screen.queryByRole("dialog", { name: "Editor onboarding" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cheat Sheet" }));
    expect(screen.getByRole("dialog", { name: "Editor onboarding" })).toBeInTheDocument();
    expect(screen.getByText("Gestures")).toBeInTheDocument();
    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Interaction patterns")).toBeInTheDocument();
  });

  it("can be dismissed and reopened from toolbar", () => {
    render(<EditorSurface />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cheat Sheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog", { name: "Editor onboarding" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(dismissedKey)).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cheat Sheet" }));
    expect(screen.getByRole("dialog", { name: "Editor onboarding" })).toBeInTheDocument();
  });
});
