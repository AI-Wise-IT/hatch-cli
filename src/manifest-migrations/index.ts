// Ordered migration-function registry for hatch.manifest.json (ADR-0010).
// Every command that reads the manifest routes it through migrateManifest()
// before using its contents.

export const CURRENT_SCHEMA_VERSION = 3;

type Manifest = Record<string, unknown>;
type Migration = (manifest: Manifest) => Manifest;

// Keyed by the schema version a migration function migrates *from*.
const migrations: Record<number, Migration> = {
  // v1 -> v2 (0017-manifest-schema-v2-group-membership.md): adds an
  // optional `group` field per skill entry and group entries recorded in
  // `skills` alongside skills — both purely additive, so this migration is
  // a schema-version bump only; no existing v1 field is renamed or removed,
  // and nothing is backfilled onto pre-existing entries.
  1: (manifest) => manifest,
  // v2 -> v3 (0018-manifest-content-hash-local-edit-detection.md,
  // 0020-standalone-version-pin-manifest-and-parsing.md): adds optional
  // `contentHash` and `pin` fields per skill entry — one migration, two
  // additive fields, per 0020's own precedent decision not to split them
  // into competing schema bumps. Nothing is backfilled onto pre-existing
  // v2 entries: a skill imported before this batch has no baseline
  // contentHash and no pin until it's next placed or pinned.
  2: (manifest) => manifest,
};

export function migrateManifest(manifest: Manifest): Manifest {
  let current = manifest;
  let version =
    typeof current.schemaVersion === "number" ? current.schemaVersion : 0;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration registered from schema version ${version}`);
    }
    current = migrate(current);
    version += 1;
  }

  return { ...current, schemaVersion: CURRENT_SCHEMA_VERSION };
}
