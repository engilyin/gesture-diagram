import type { DiagramProfile } from "../types";

export const architectureProfile: DiagramProfile = {
  id: "architecture-default",
  name: "Architecture",
  libraries: [
    "service",
    "database",
    "queue",
    "cache",
    "gateway",
    "external-system",
  ],
  actionPriority: [
    "convert",
    "group",
    "style",
    "duplicate",
    "ungroup",
    "delete",
  ],
};
