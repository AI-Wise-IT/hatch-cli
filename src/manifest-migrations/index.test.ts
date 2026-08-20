import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrateManifest } from "./index.js";

describe("migrateManifest", () => {
  it("returns an already-current manifest unchanged", () => {
    const manifest = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      harnesses: ["claude"],
    };
    expect(migrateManifest(manifest)).toEqual(manifest);
  });

  it("throws when no migration is registered for an older schema version", () => {
    expect(() => migrateManifest({ schemaVersion: 0 })).toThrow(
      /No migration registered/,
    );
  });

  it("migrates a v1 manifest all the way to current as schema-only bumps (0017, 0018, 0020, 0027)", () => {
    const v1 = {
      schemaVersion: 1,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    };
    expect(migrateManifest(v1)).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });
  });

  it("migrates a v2 manifest to current as a schema-only bump, backfilling no contentHash/pin (0018, 0020)", () => {
    const v2 = {
      schemaVersion: 2,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    };
    expect(migrateManifest(v2)).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });
  });

  it("migrates a v3 manifest to v4 leaving every recorded value untouched, backfilling no testProject (0027)", () => {
    const v3 = {
      schemaVersion: 3,
      harnesses: ["claude", "codex"],
      skills: {
        "hatch-usage": { version: "1.2.0", contentHash: "sha256-abc" },
        "prd-elicitation": {
          version: "1.0.0",
          pin: { type: "exact", value: "1.0.0" },
          contentHash: "sha256-def",
        },
        "design-architecture-decision": {
          version: "1.1.0",
          group: "architecture-decisions",
        },
      },
    };
    const migrated = migrateManifest(v3);

    expect(migrated).toEqual({ ...v3, schemaVersion: 4 });
    expect(migrated.testProject).toBeUndefined();
  });
});
