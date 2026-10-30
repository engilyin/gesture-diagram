import { CURRENT_SCHEMA_VERSION } from "./schema";

type PersistedEnvelope = {
  schemaVersion: string;
  updatedAt: string;
  document: unknown;
};

type Migration = (source: PersistedEnvelope) => PersistedEnvelope;

const migrations: Record<string, Migration> = {
  "1.0.0": (source) => ({
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    document: (() => {
      if (!source.document || typeof source.document !== "object") {
        return source.document;
      }
      const document = source.document as { metadata?: unknown };
      const metadata =
        document.metadata && typeof document.metadata === "object"
          ? document.metadata
          : {};
      return {
        ...document,
        metadata: {
          ...metadata,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          updatedAt: source.updatedAt,
        },
      };
    })(),
  }),
};

function assertPersistedEnvelope(input: unknown): PersistedEnvelope {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid persisted document payload");
  }

  const candidate = input as Partial<PersistedEnvelope>;
  if (typeof candidate.schemaVersion !== "string") {
    throw new Error("Persisted document is missing schemaVersion metadata");
  }
  if (typeof candidate.updatedAt !== "string") {
    throw new Error("Persisted document is missing updatedAt metadata");
  }
  if (candidate.document == null) {
    throw new Error("Persisted document is missing document payload");
  }

  return {
    schemaVersion: candidate.schemaVersion,
    updatedAt: candidate.updatedAt,
    document: candidate.document,
  };
}

export function runSchemaMigrations(input: unknown): unknown {
  let current = assertPersistedEnvelope(input);
  const visited = new Set<string>();

  while (current.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[current.schemaVersion];
    if (!migrate) {
      throw new Error(`Unsupported schema version: ${current.schemaVersion}`);
    }
    if (visited.has(current.schemaVersion)) {
      throw new Error(`Circular schema migration at version ${current.schemaVersion}`);
    }
    visited.add(current.schemaVersion);
    current = migrate(current);
  }

  return current;
}
