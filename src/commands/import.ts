// `hatch import` (UC-3): imports a single named standalone skill, or a whole
// group atomically, into an existing project — auto-initializing git if
// needed, authenticating if needed, fetching the target per harness (for a
// standalone skill, resolving harness-suffixed vs. plain variants) or
// resolving the target's full member graph (for a group, per
// 0013-registry-group-structure-and-permanence.md and
// 0016-group-member-manifest-format.md), placing it, updating the manifest,
// and committing once.
// Batch 5/6 scope: UC-3 main flow (standalone, group), AF-6 (destination
// occupied), AF-7 (registry unreachable), AF-8 (invalid password), AF-9
// (pinned-pointer version conflict, group-only).
// Batch 7 scope (this batch): re-import/staleness — AF-1 (already up to
// date), AF-2 (update available), AF-3 (local edits present), AF-4
// (deprecated/removed detection, every invocation, every previously-
// imported name) — plus standalone version pinning folded in via
// rescope-0001: AF-10 (bare re-import respects a standing exact pin),
// AF-11 (`<name>@<version>` exact pin), AF-12 (`<name>@^<version>` range
// pin). --add-harness (AF-5) is Batch 9.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { CheckRepoActions, simpleGit } from "simple-git";
import { resolveToken, writeCredentials } from "../auth/credentials.js";
import { validateGitHubToken } from "../auth/github-token.js";
import { promptHidden, promptLine } from "../cli/prompt.js";
import {
  getHarnessDefinition,
  isKnownHarness,
  resolveSkillFolderName,
} from "../harness-registry.js";
import {
  hashEntries,
  hashFromDisk,
} from "../manifest-migrations/content-hash.js";
import { migrateManifest } from "../manifest-migrations/index.js";
import {
  type Pin,
  type PinSpec,
  parseImportTarget,
  pinsEqual,
  resolvePin,
} from "../manifest-migrations/pin-spec.js";
import {
  type RegistryFetchOk,
  fetchRegistryFile,
  fetchRegistryFolder,
  registryFolderExists,
} from "../registry/fetch.js";
import {
  type GroupResolveFailureReason,
  parseGroupSkillJson,
  resolveGroupMembers,
} from "../registry/group-resolve.js";
import { isNewerCompatible } from "../registry/semver.js";

interface ParsedArgs {
  targetName: string;
  spec: PinSpec;
  targetPath: string;
  harnessArg: string | undefined;
}

interface ConflictOutcome {
  destFile: string;
  outcome: "skipped" | "suffixed";
  finalPath?: string;
}

// The manifest's per-name entry shape as of schema v3 (0017, 0018, 0020).
interface SkillEntry {
  version: string;
  group?: string;
  // Absent for a group's own top-level entry (0018) and for any
  // pre-Batch-7 (v1/v2) entry never re-placed since this batch shipped.
  contentHash?: string;
  // Only ever written on the entry named on the command line (a standalone
  // skill or a group itself) — never on a group member's own entry, per
  // 0020's explicit separation from a group's internal pointer-member pin.
  pin?: Pin;
}

// What gets placed into every declared harness folder under its own name:
// a standalone skill import produces exactly one target; a group import
// produces one per resolved member (never the group's own folder — groups
// are always unpacked flat, per ADR-0013).
interface PlacementTarget {
  name: string;
  version: string;
  group: string | undefined;
  // Same content placed under every declared harness — a standalone
  // skill's content can differ per harness (suffix resolution); a group
  // member's content, resolved once by resolveGroupMembers, does not.
  filesByHarness: Map<string, Map<string, string>>;
  // True when this target already has a manifest entry whose contentHash
  // matched what's on disk — placement overwrites it directly rather than
  // running it through AF-6 conflict detection, since that check exists
  // for content Hatch never placed, not content it's now updating.
  isUpdate: boolean;
}

// Thrown internally to short-circuit out to a single AF-7 handler, whether
// unreachability was hit while resolving a harness-suffixed folder name or
// while fetching the resolved folder's content.
class RegistryUnreachableError extends Error {}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const positional: string[] = [];
  let targetPath = process.cwd();
  let harnessArg: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--path requires a value" };
      }
      targetPath = value;
    } else if (arg === "--harness") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--harness requires a value" };
      }
      harnessArg = value;
    } else if (arg.startsWith("--")) {
      return { error: `unrecognized option "${arg}"` };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return { error: "a skill name is required" };
  }
  if (positional.length > 1) {
    return { error: `unexpected extra argument "${positional[1]}"` };
  }

  const { name, spec } = parseImportTarget(positional[0]);
  if (!name) {
    return { error: `invalid skill/group argument "${positional[0]}"` };
  }

  return {
    targetName: name,
    spec,
    targetPath: resolve(targetPath),
    harnessArg,
  };
}

function isNetworkFailure(reason: string | undefined): boolean {
  return (
    typeof reason === "string" && reason.startsWith("could not reach GitHub")
  );
}

function extractSkillVersionFromRaw(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function extractSkillVersion(files: Map<string, string>): string {
  const raw = files.get("skill.json");
  return raw ? extractSkillVersionFromRaw(raw) : "0.0.0";
}

// Finds a free path alongside `destFile` by inserting a ".hatch-import[-N]"
// token before the extension, incrementing N until nothing occupies it.
function resolveAvailableSuffixedPath(destFile: string): string {
  const dir = dirname(destFile);
  const ext = extname(destFile);
  const stem = destFile.slice(dir.length + 1, destFile.length - ext.length);

  let n = 1;
  let candidate: string;
  do {
    const token = n === 1 ? "hatch-import" : `hatch-import-${n}`;
    candidate = join(dir, `${stem}.${token}${ext}`);
    n++;
  } while (existsSync(candidate));

  return candidate;
}

// AF-6: interactive runs ask the developer; unattended (no TTY) defaults to
// skip without prompting, per UC-3.
async function resolveDestinationConflict(
  destFile: string,
  interactive: boolean,
): Promise<"skip" | "suffix"> {
  if (!interactive) {
    return "skip";
  }
  const answer = (
    await promptLine(
      `"${destFile}" already exists and wasn't placed by Hatch. Skip this file, or import it alongside with a suffix? [skip/suffix] `,
    )
  ).toLowerCase();
  return answer.startsWith("suf") ? "suffix" : "skip";
}

async function checkFolderExists(
  token: string,
  folderName: string,
): Promise<boolean> {
  const result = await registryFolderExists(token, folderName);
  if (!result.ok) {
    throw new RegistryUnreachableError(result.detail);
  }
  return result.exists;
}

// Maps any registry-fetch-shaped failure to the same "registry unreachable
// (...)" wording every AF-7 trigger point uses; a not-found detail is
// already a complete, reportable sentence on its own.
function fetchFailureMessage(result: {
  reason: GroupResolveFailureReason | "not-found" | "unreachable";
  detail: string;
}): string {
  return result.reason === "unreachable"
    ? `registry unreachable (${result.detail})`
    : result.detail;
}

// AF-4: checks every manifest-recorded skill/group's own current skill.json
// for a `removed: true` flag (0019-registry-removed-metadata-flag.md), on
// every invocation, independent of this run's primary target. Best-effort
// and read-only — a fetch failure for one name is silently skipped rather
// than failing the whole command; this check must never itself block or
// alter the primary operation.
async function checkRemovedFlags(
  token: string,
  names: string[],
): Promise<string[]> {
  const warnings: string[] = [];
  for (const name of names) {
    const result = await fetchRegistryFile(token, `${name}/skill.json`);
    if (!result.ok) {
      continue;
    }
    try {
      const parsed = JSON.parse(result.content) as { removed?: unknown };
      if (parsed.removed === true) {
        warnings.push(
          `"${name}" has been removed from the registry (its content remains fetchable, but it's no longer active).`,
        );
      }
    } catch {
      // A malformed skill.json isn't this check's concern to validate.
    }
  }
  return warnings;
}

export async function runImport(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch import: ${parsed.error} — nothing was changed.`);
    return 1;
  }
  const { targetName: name, spec, targetPath, harnessArg } = parsed;

  if (!existsSync(targetPath)) {
    console.error(
      `hatch import: target project "${targetPath}" does not exist — nothing was changed.`,
    );
    return 1;
  }

  // Manifest bootstrap (0015-import-harness-selection-flag.md): a project
  // that already has a manifest is governed by its recorded harnesses,
  // never the filesystem or a passed --harness; a manifest-less project
  // requires --harness to seed one.
  const manifestPath = join(targetPath, "hatch.manifest.json");
  const manifestExistedBefore = existsSync(manifestPath);
  let originalManifestRaw: string | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: manifest shape is migrated/validated ad hoc, same as new.ts
  let existingManifest: Record<string, any> | undefined;
  if (manifestExistedBefore) {
    originalManifestRaw = readFileSync(manifestPath, "utf8");
    existingManifest = migrateManifest(JSON.parse(originalManifestRaw));
  }
  const existingSkills: Record<string, SkillEntry> =
    existingManifest &&
    typeof existingManifest.skills === "object" &&
    existingManifest.skills !== null
      ? (existingManifest.skills as Record<string, SkillEntry>)
      : {};

  let harnesses: string[];
  if (existingManifest) {
    const recorded = existingManifest.harnesses;
    if (
      !Array.isArray(recorded) ||
      recorded.length === 0 ||
      !recorded.every((h) => typeof h === "string")
    ) {
      console.error(
        `hatch import: "${manifestPath}" has no valid harnesses recorded — nothing was changed.`,
      );
      return 1;
    }
    harnesses = recorded as string[];
  } else {
    if (!harnessArg) {
      console.error(
        "hatch import: no hatch.manifest.json found in this project — --harness <name[,name...]> is required for a first import — nothing was changed.",
      );
      return 1;
    }
    const requested = harnessArg
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      console.error(
        "hatch import: --harness <name[,name...]> is required for a first import — nothing was changed.",
      );
      return 1;
    }
    const unknownHarnesses = requested.filter((h) => !isKnownHarness(h));
    if (unknownHarnesses.length > 0) {
      console.error(
        `hatch import: unrecognized harness(es): ${unknownHarnesses.join(", ")} — nothing was changed.`,
      );
      return 1;
    }
    harnesses = requested;
  }
  const sortedHarnesses = [...harnesses].sort();
  const primaryHarness = sortedHarnesses[0];

  // UC-3 step 2: auto-init git if the target isn't already a repo. Not
  // rolled back on a later failure — it's an idempotent, one-time setup
  // step, not part of "nothing changed" per UC-3's postcondition, which
  // scopes that guarantee to content placed / manifest / commit.
  const git = simpleGit(targetPath);
  try {
    const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
    if (!isRepo) {
      await git.init();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch import: failed to initialize git (${message}) — nothing was changed.`,
    );
    return 1;
  }

  // UC-3 step 3: authenticate if no session already resolves.
  let token = resolveToken();
  if (!token) {
    const candidate = (
      await promptHidden("Registry personal access token: ")
    ).trim();
    if (!candidate) {
      console.error("hatch import: no token provided — nothing was changed.");
      return 1;
    }

    const validation = await validateGitHubToken(candidate);
    if (!validation.valid) {
      if (isNetworkFailure(validation.reason)) {
        console.error(
          `hatch import: registry unreachable (${validation.reason}) — nothing was changed.`,
        );
      } else {
        console.error(
          `hatch import: invalid password (${validation.reason}) — nothing was changed.`,
        );
      }
      return 1;
    }

    writeCredentials(candidate);
    token = candidate;
  }

  // AF-4: deprecation/removal check across every previously-imported name,
  // independent of this run's primary target — surfaced regardless of the
  // primary outcome (0019-registry-removed-metadata-flag.md).
  const removedWarnings = await checkRemovedFlags(
    token,
    Object.keys(existingSkills),
  );
  for (const warning of removedWarnings) {
    console.log(`hatch import: warning: ${warning}`);
  }

  const existingEntry = existingSkills[name];

  // AF-10: a bare re-import of a standing exact pin skips the update check
  // entirely — no fetch of the primary target at all.
  if (spec.kind === "none" && existingEntry?.pin?.type === "exact") {
    console.log(
      `hatch import: "${name}" is pinned at v${existingEntry.pin.value} — left untouched.`,
    );
    return 0;
  }

  const newPin = resolvePin(spec, existingEntry?.pin);
  const fetchRef = spec.kind === "exact" ? `${name}@${spec.value}` : undefined;

  // UC-3 step 4: classify the target — or, if it's a group, resolve and
  // fetch the whole group atomically (0013, 0016). A group's own folder is
  // never harness-suffixed (unlike a plain skill), so classification reads
  // the exact name's skill.json directly, once, ahead of any per-harness
  // resolution.
  const classifyResult = await fetchRegistryFile(
    token,
    `${name}/skill.json`,
    fetchRef,
  );
  if (!classifyResult.ok) {
    if (classifyResult.reason === "unreachable") {
      console.error(
        `hatch import: ${fetchFailureMessage(classifyResult)} — nothing was changed.`,
      );
      return 1;
    }
    // Not found: for an explicit pin, that's a real, reportable failure —
    // the name or that exact version tag doesn't exist. For an unpinned
    // request it's not fatal here; the standalone flow below performs its
    // own per-harness existence check next (this classify fetch is only an
    // opportunistic group/plain-skill probe).
    if (fetchRef) {
      console.error(
        `hatch import: "${fetchRef}" was not found in the registry — nothing was changed.`,
      );
      return 1;
    }
  }

  let isGroup = false;
  let rootGroupVersion: string | undefined;
  let groupWarnings: string[] = [];
  let placementTargets: PlacementTarget[] = [];
  let pinOnlyChange = false;
  const skippedLocalEdits: string[] = [];

  if (classifyResult.ok) {
    let meta: ReturnType<typeof parseGroupSkillJson>;
    try {
      meta = parseGroupSkillJson(classifyResult.content, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`hatch import: ${message} — nothing was changed.`);
      return 1;
    }

    if (meta.members) {
      isGroup = true;

      // AF-1/AF-2 version gate at the group level: skip the whole
      // fetch/resolve when this isn't an exact-pin request and the group
      // is already at the latest compatible version — a group version
      // bump is required (CI-enforced, ADR-0009) for its member list to
      // change at all, so an unchanged group version means nothing about
      // its members changed either.
      if (
        spec.kind !== "exact" &&
        existingEntry &&
        !isNewerCompatible(existingEntry.version, meta.version)
      ) {
        if (pinsEqual(newPin, existingEntry.pin)) {
          console.log(
            `hatch import: "${name}" is already up to date (v${existingEntry.version}).`,
          );
          return 0;
        }
        pinOnlyChange = true;
      } else {
        rootGroupVersion = meta.version;
        const rootFolderFetch = await fetchRegistryFolder(
          token,
          name,
          fetchRef,
        );
        if (!rootFolderFetch.ok) {
          console.error(
            `hatch import: ${fetchFailureMessage(rootFolderFetch)} — nothing was changed.`,
          );
          return 1;
        }

        const resolveResult = await resolveGroupMembers(
          token,
          name,
          meta.version,
          meta.members,
          rootFolderFetch.files,
        );
        if (!resolveResult.ok) {
          console.error(
            `hatch import: ${fetchFailureMessage(resolveResult)} — nothing was changed.`,
          );
          return 1;
        }
        groupWarnings = resolveResult.warnings;

        for (const member of resolveResult.members) {
          const memberEntry = existingSkills[member.name];
          const isUpdate = Boolean(memberEntry);

          if (memberEntry?.contentHash) {
            const memberDir = join(
              targetPath,
              getHarnessDefinition(primaryHarness).skillsDir,
              member.name,
            );
            const onDiskHash = hashFromDisk(memberDir, member.files.keys());
            if (onDiskHash !== memberEntry.contentHash) {
              skippedLocalEdits.push(member.name);
              continue;
            }
          }
          placementTargets.push({
            name: member.name,
            version: member.version,
            group: name,
            filesByHarness: new Map(
              sortedHarnesses.map((harness) => [harness, member.files]),
            ),
            isUpdate,
          });
        }
      }
    }
  }

  if (!isGroup && !pinOnlyChange) {
    // Standalone flow (Batch 5): resolve, per harness, which registry
    // folder to fetch (0001-harness-suffix-convention.md: prefer
    // "<name>-<code>", else "<name>", else unavailable), then fetch each
    // distinct resolved folder once. Folder-name existence is resolved
    // unversioned even for a pinned import — the resolved folder's own
    // per-version tag history is what an exact/range pin refers to, not
    // whether a harness-suffixed sibling exists at all.
    const resolvedFolders = new Map<string, string>();
    try {
      for (const harness of sortedHarnesses) {
        const folderName = await resolveSkillFolderName(
          name,
          harness,
          (candidate) => checkFolderExists(token as string, candidate),
        );
        if (!folderName) {
          console.error(
            `hatch import: "${name}" was not found in the registry for harness "${harness}" — nothing was changed.`,
          );
          return 1;
        }
        resolvedFolders.set(harness, folderName);
      }
    } catch (error) {
      if (error instanceof RegistryUnreachableError) {
        console.error(
          `hatch import: registry unreachable (${error.message}) — nothing was changed.`,
        );
        return 1;
      }
      throw error;
    }

    const primaryFolder = resolvedFolders.get(primaryHarness) as string;

    // AF-1/AF-2 version gate: a lightweight single-file fetch of just the
    // primary folder's skill.json, avoiding a full content fetch when
    // nothing needs to change.
    if (spec.kind !== "exact" && existingEntry) {
      const primaryMeta = await fetchRegistryFile(
        token,
        `${primaryFolder}/skill.json`,
      );
      if (!primaryMeta.ok) {
        console.error(
          `hatch import: ${fetchFailureMessage(primaryMeta)} — nothing was changed.`,
        );
        return 1;
      }
      const latestVersion = extractSkillVersionFromRaw(primaryMeta.content);
      if (!isNewerCompatible(existingEntry.version, latestVersion)) {
        if (pinsEqual(newPin, existingEntry.pin)) {
          console.log(
            `hatch import: "${name}" is already up to date (v${existingEntry.version}).`,
          );
          return 0;
        }
        pinOnlyChange = true;
      }
    }

    if (!pinOnlyChange) {
      const distinctFolders = [...new Set(resolvedFolders.values())];
      const fetchResults = new Map<string, RegistryFetchOk>();
      for (const folderName of distinctFolders) {
        const result = await fetchRegistryFolder(token, folderName, fetchRef);
        if (!result.ok) {
          console.error(
            `hatch import: ${fetchFailureMessage(result)} — nothing was changed.`,
          );
          return 1;
        }
        fetchResults.set(folderName, result);
      }

      // Manifest version recorded for this skill: taken from the first
      // (alphabetically) declared harness's resolved folder. Every harness
      // resolves to the same folder for today's harness-neutral registry
      // content, so this is not yet exercised by divergent per-harness
      // versions — revisit if/when a skill actually ships differently
      // versioned harness-suffixed variants.
      const primaryFiles = (fetchResults.get(primaryFolder) as RegistryFetchOk)
        .files;
      const version = extractSkillVersion(primaryFiles);

      const isUpdate = Boolean(existingEntry);
      if (existingEntry?.contentHash) {
        const skillDir = join(
          targetPath,
          getHarnessDefinition(primaryHarness).skillsDir,
          name,
        );
        const relativePaths = [...primaryFiles.keys()].filter(
          (p) => p !== "skill.json",
        );
        const onDiskHash = hashFromDisk(skillDir, relativePaths);
        if (onDiskHash !== existingEntry.contentHash) {
          console.log(
            `hatch import: "${name}" has local edits — left untouched.`,
          );
          return 0;
        }
      }
      placementTargets = [
        {
          name,
          version,
          group: undefined,
          filesByHarness: new Map(
            sortedHarnesses.map((harness) => [
              harness,
              (
                fetchResults.get(
                  resolvedFolders.get(harness) as string,
                ) as RegistryFetchOk
              ).files,
            ]),
          ),
          isUpdate,
        },
      ];
    }
  }

  // Pin-only change: version (group or standalone) is already at the
  // latest compatible level, but this run's spec still changes the
  // recorded pin (a fresh/updated range pin, or an explicit @latest
  // clearing an existing one) — a manifest-only update, its own commit.
  if (pinOnlyChange) {
    const entry: SkillEntry = {
      version: (existingEntry as SkillEntry).version,
    };
    if ((existingEntry as SkillEntry).group !== undefined) {
      entry.group = (existingEntry as SkillEntry).group;
    }
    if ((existingEntry as SkillEntry).contentHash !== undefined) {
      entry.contentHash = (existingEntry as SkillEntry).contentHash;
    }
    if (newPin) {
      entry.pin = newPin;
    }
    const manifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      skills: { ...existingSkills, [name]: entry },
    });
    try {
      writeFileSync(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      await git.add(".");
      await git.commit(
        newPin
          ? `hatch import: pin "${name}" to ${newPin.type === "exact" ? "v" : ">=v"}${newPin.value}`
          : `hatch import: clear the version pin for "${name}"`,
      );
    } catch (error) {
      if (originalManifestRaw !== undefined) {
        writeFileSync(manifestPath, originalManifestRaw, "utf8");
      } else {
        rmSync(manifestPath, { force: true });
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `hatch import: failed to update the pin for "${name}" (${message}) — nothing was changed.`,
      );
      return 1;
    }
    console.log(
      newPin
        ? `hatch import: "${name}" recorded as ${newPin.type === "exact" ? "exactly pinned" : "range-pinned"} at v${newPin.value} (already at v${(existingEntry as SkillEntry).version}).`
        : `hatch import: cleared the version pin for "${name}" (still at v${(existingEntry as SkillEntry).version}).`,
    );
    return 0;
  }

  const interactive = Boolean(process.stdin.isTTY);
  const conflictOutcomes: ConflictOutcome[] = [];
  const writtenFiles: string[] = [];
  const contentHashes = new Map<string, string>();

  try {
    // UC-3 steps 5-6: check each destination path and place content per
    // declared harness, for every resolved target (one for a standalone
    // skill, one per member for a group — always flat, per ADR-0013). A
    // target already verified as an unmodified update (isUpdate, hash
    // matched above) overwrites its destination directly — AF-6 exists for
    // content Hatch never placed, not content it's now updating.
    for (const target of placementTargets) {
      const excludedFromHash = new Set<string>();

      for (const harness of sortedHarnesses) {
        const files = target.filesByHarness.get(harness) as Map<string, string>;
        const definition = getHarnessDefinition(harness);
        const skillDestDir = join(
          targetPath,
          definition.skillsDir,
          target.name,
        );

        for (const [relativePath, content] of files) {
          if (relativePath === "skill.json") {
            continue; // registry metadata, not part of the deployed skill content
          }
          let destFile = join(skillDestDir, relativePath);

          if (!target.isUpdate && existsSync(destFile)) {
            const decision = await resolveDestinationConflict(
              destFile,
              interactive,
            );
            if (decision === "skip") {
              conflictOutcomes.push({ destFile, outcome: "skipped" });
              if (harness === primaryHarness) {
                excludedFromHash.add(relativePath);
              }
              continue;
            }
            const finalPath = resolveAvailableSuffixedPath(destFile);
            conflictOutcomes.push({
              destFile,
              outcome: "suffixed",
              finalPath,
            });
            if (harness === primaryHarness) {
              excludedFromHash.add(relativePath);
            }
            destFile = finalPath;
          }

          mkdirSync(dirname(destFile), { recursive: true });
          writeFileSync(destFile, content, "utf8");
          writtenFiles.push(destFile);
        }
      }

      // 0018-manifest-content-hash-local-edit-detection.md: hashed from the
      // primary declared harness's placed content only, excluding
      // skill.json and anything that hit AF-6 skip/suffix handling above.
      const primaryFiles = target.filesByHarness.get(primaryHarness) as Map<
        string,
        string
      >;
      const entries: Array<[string, string]> = [
        ...primaryFiles.entries(),
      ].filter(
        ([relativePath]) =>
          relativePath !== "skill.json" && !excludedFromHash.has(relativePath),
      );
      contentHashes.set(target.name, hashEntries(entries));
    }

    // UC-3 step 7: write/update the manifest. A group's own name is
    // recorded alongside its members (0017-manifest-schema-v2-group-membership.md);
    // each member entry names the group that placed it. `pin` is only ever
    // written on the entry named on the command line (0020).
    const skillsUpdate: Record<string, SkillEntry> = {};
    for (const target of placementTargets) {
      const entry: SkillEntry = {
        version: target.version,
        contentHash: contentHashes.get(target.name) as string,
      };
      if (target.group !== undefined) {
        entry.group = target.group;
      }
      skillsUpdate[target.name] = entry;
    }
    if (isGroup) {
      const groupEntry: SkillEntry = {
        version: rootGroupVersion as string,
      };
      if (newPin) {
        groupEntry.pin = newPin;
      }
      skillsUpdate[name] = groupEntry;
    } else if (placementTargets.length > 0) {
      if (newPin) {
        skillsUpdate[name].pin = newPin;
      }
    }
    const manifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      skills: {
        ...existingSkills,
        ...skillsUpdate,
      },
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    // UC-3 step 8: exactly one commit for the whole operation.
    await git.add(".");
    const commitMessage = !existingEntry
      ? isGroup
        ? `hatch import: add group "${name}" (${placementTargets.length} member${placementTargets.length === 1 ? "" : "s"})`
        : `hatch import: add "${name}"`
      : isGroup
        ? `hatch import: update group "${name}" (v${existingEntry.version} → v${rootGroupVersion})`
        : `hatch import: update "${name}" (v${existingEntry.version} → v${(placementTargets[0] as PlacementTarget).version})`;
    await git.commit(commitMessage);
  } catch (error) {
    for (const file of writtenFiles) {
      rmSync(file, { force: true });
    }
    if (originalManifestRaw !== undefined) {
      writeFileSync(manifestPath, originalManifestRaw, "utf8");
    } else {
      rmSync(manifestPath, { force: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch import: failed to import "${name}" (${message}) — nothing was changed.`,
    );
    return 1;
  }

  // UC-3 step 9: summary.
  if (isGroup) {
    console.log(
      !existingEntry
        ? `hatch import: added group "${name}" (v${rootGroupVersion}) with ${placementTargets.length} member(s) to harness(es) ${sortedHarnesses.join(", ")}.`
        : `hatch import: updated group "${name}" (v${existingEntry.version} → v${rootGroupVersion}) — ${placementTargets.length} member(s) placed to harness(es) ${sortedHarnesses.join(", ")}.`,
    );
    for (const target of placementTargets) {
      const prior = existingSkills[target.name];
      console.log(
        prior && prior.version !== target.version
          ? `  "${target.name}" updated (v${prior.version} → v${target.version})`
          : `  "${target.name}" (v${target.version})`,
      );
    }
    for (const skipped of skippedLocalEdits) {
      console.log(`  "${skipped}" has local edits — left untouched.`);
    }
    for (const warning of groupWarnings) {
      console.log(`  warning: ${warning}`);
    }
  } else {
    const target = placementTargets[0] as PlacementTarget;
    console.log(
      !existingEntry
        ? `hatch import: added "${name}" (v${target.version}) to harness(es) ${sortedHarnesses.join(", ")}.`
        : `hatch import: updated "${name}" (v${existingEntry.version} → v${target.version}) to harness(es) ${sortedHarnesses.join(", ")}.`,
    );
  }
  if (newPin) {
    console.log(
      `  pinned ${newPin.type === "exact" ? "exactly at" : "with a range floor of"} v${newPin.value}.`,
    );
  }
  for (const outcome of conflictOutcomes) {
    if (outcome.outcome === "skipped") {
      console.log(
        `  skipped "${outcome.destFile}" — already existed and wasn't placed by Hatch.`,
      );
    } else {
      console.log(
        `  "${outcome.destFile}" already existed — placed alongside it as "${outcome.finalPath}".`,
      );
    }
  }

  return 0;
}
