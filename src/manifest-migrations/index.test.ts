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
});
