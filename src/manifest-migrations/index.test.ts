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

  it("migrates a v1 manifest all the way to current as schema-only bumps (0017, 0018, 0020)", () => {
    const v1 = {
      schemaVersion: 1,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    };
    expect(migrateManifest(v1)).toEqual({
      schemaVersion: 3,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });
  });

  it("migrates a v2 manifest to v3 as a schema-only bump, backfilling no contentHash/pin (0018, 0020)", () => {
    const v2 = {
      schemaVersion: 2,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    };
    expect(migrateManifest(v2)).toEqual({
      schemaVersion: 3,
      harnesses: ["claude"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });
  });
});
