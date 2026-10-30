import { describe, expect, it } from "vitest";
import {
  getDefaultProfile,
  getProfile,
  listProfiles,
} from "../profiles/registry";

describe("profile registry", () => {
  it("lists architecture profile", () => {
    const profiles = listProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    expect(
      profiles.some((profile) => profile.id === "architecture-default"),
    ).toBe(true);
  });

  it("returns default profile and supports lookup", () => {
    const profile = getDefaultProfile();
    expect(profile.id).toBe("architecture-default");
    expect(getProfile(profile.id)?.name).toBe("Architecture");
  });
});
