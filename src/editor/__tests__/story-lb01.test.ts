import { describe, expect, it } from "vitest";
import { builtInLibraryShapes, getBuiltInLibraryCategories } from "../library";

describe("STORY-LB01 built-in shape library", () => {
  it("provides at least 20 shapes across at least 2 categories", () => {
    expect(builtInLibraryShapes.length).toBeGreaterThanOrEqual(20);
    expect(getBuiltInLibraryCategories().length).toBeGreaterThanOrEqual(2);
  });
});
