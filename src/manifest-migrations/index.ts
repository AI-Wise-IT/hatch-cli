// Ordered migration-function registry for hatch.manifest.json (ADR-0010).
// Every command that reads the manifest routes it through migrateManifest()
// before using its contents.

export const CURRENT_SCHEMA_VERSION = 1;

type Manifest = Record<string, unknown>;
type Migration = (manifest: Manifest) => Manifest;

// Keyed by the schema version a migration function migrates *from*.
// Empty for now — schema version 1 is the first shape `hatch new` writes,
// so the first real migration (1 -> 2) is added here when it's needed.
const migrations: Record<number, Migration> = {};

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
