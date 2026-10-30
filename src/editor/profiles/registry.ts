import type { DiagramProfile } from "../types";
import { architectureProfile } from "./architecture";

const profiles = new Map<string, DiagramProfile>([
  [architectureProfile.id, architectureProfile],
]);

export function listProfiles(): DiagramProfile[] {
  return [...profiles.values()];
}

export function getProfile(profileId: string): DiagramProfile | null {
  return profiles.get(profileId) ?? null;
}

export function getDefaultProfile(): DiagramProfile {
  return architectureProfile;
}
