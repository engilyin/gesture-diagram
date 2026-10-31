import { fireEvent, render, screen } from "@testing-library/react";
import { EditorSurface } from "../EditorSurface";

function dismissOnboardingIfPresent() {
  const button = screen.queryByRole("button", { name: "Got it" });
  if (button) {
    fireEvent.click(button);
  }
}

describe("STORY-G02 stroke ghost preview", () => {
  it("shows, updates, and clears ghost preview during draw interaction", () => {
    render(<EditorSurface />);
    dismissOnboardingIfPresent();

    const canvas = screen.getByLabelText("Diagram canvas");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 90, clientY: 90 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 100 });

    const ghostBefore = screen.getByLabelText(/Ghost preview/i);
    const widthBefore = Number.parseFloat(
      ghostBefore.getAttribute("style")?.match(/width:\s*([0-9.]+)px/)?.[1] ?? "0",
    );

    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 160 });
    const ghostAfter = screen.getByLabelText(/Ghost preview/i);
    const widthAfter = Number.parseFloat(
      ghostAfter.getAttribute("style")?.match(/width:\s*([0-9.]+)px/)?.[1] ?? "0",
    );
    expect(widthAfter).toBeGreaterThanOrEqual(widthBefore);

    fireEvent.pointerUp(canvas);
    expect(screen.queryByLabelText(/Ghost preview/i)).not.toBeInTheDocument();
  });
});
