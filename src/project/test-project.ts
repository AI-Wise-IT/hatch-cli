// Test-project opt-in (0027-testing-skill-convention.md): a project whose
// manifest records `testProject: true` may import testing content; every
// other project may not. The field is optional and additive — absent means
// an ordinary project, which is the default every existing manifest gets.
//
// Callers pass an already-migrated manifest (migrateManifest), so this never
// has to reason about schema versions itself.

export function isTestProject(manifest: { testProject?: unknown }): boolean {
  return manifest.testProject === true;
}
