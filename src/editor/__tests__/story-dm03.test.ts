import { describe, expect, it } from "vitest";
import { deserializeDocument } from "../persistence/yamlCodec";
import { CURRENT_SCHEMA_VERSION } from "../schema";

describe("STORY-DM03 schema migrations", () => {
  it("migrates a 1.0.0 fixture to the current schema version", async () => {
    const fixtureModule = await import("./fixtures/schema-1.0.0.yaml?raw");
    const fixture = fixtureModule.default as string;

    const migrated = deserializeDocument(fixture);
    expect(migrated.metadata?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.metadata?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(migrated.elements).toHaveLength(1);
    expect(migrated.elements[0]?.id).toBe("shape-1");
  });
});
