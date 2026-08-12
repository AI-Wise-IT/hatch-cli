// Filenames that exist in a registry folder for authoring/metadata purposes
// only, and are never deployed into a target project: skill.json (per-folder
// version/group/removed metadata, 0009-skill-versioning-semver-tags.md,
// 0016-group-member-manifest-format.md, 0019-registry-removed-metadata-flag.md)
// and NOTE.md (fixture-authoring documentation, e.g. _harness-suffix-fixture,
// _reimport-fixture). Anything else in a registry folder is real, deployable
// skill content.

export const REGISTRY_ONLY_FILES: ReadonlySet<string> = new Set([
  "skill.json",
  "NOTE.md",
]);

export function isRegistryOnlyFile(relativePath: string): boolean {
  return REGISTRY_ONLY_FILES.has(relativePath);
}
