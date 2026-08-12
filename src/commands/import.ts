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
// Batch 7 scope: re-import/staleness — AF-1 (already up to date), AF-2
// (update available), AF-3 (local edits present), AF-4 (deprecated/removed
// detection, every invocation, every previously-imported name) — plus
// standalone version pinning folded in via rescope-0001: AF-10 (bare
// re-import respects a standing exact pin), AF-11 (`<name>@<version>` exact
// pin), AF-12 (`<name>@^<version>` range pin).
// Batch 9 scope (this batch): AF-5, `--add-harness <name>` — backfills
// every already-imported skill/group's content into a newly-added harness,
// re-resolving each standalone skill's harness-suffix variant fresh for the
// new harness (0001-harness-suffix-convention.md) and re-unpacking each
// group fresh at its currently-recorded version, all at the version already
// recorded in the manifest — never triggering an update.

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
import { isRegistryOnlyFile } from "../registry/registry-only-files.js";
import { isNewerCompatible } from "../registry/semver.js";

interface ParsedArgs {
  // Exactly one of targetName/addHarness is set — parseArgs enforces this.
  targetName: string | undefined;
  spec: PinSpec;
  targetPath: string;
  harnessArg: string | undefined;
  addHarness: string | undefined;
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
  let addHarness: string | undefined;

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
    } else if (arg === "--add-harness") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--add-harness requires a value" };
      }
      addHarness = value;
    } else if (arg.startsWith("--")) {
      return { error: `unrecognized option "${arg}"` };
    } else {
      positional.push(arg);
    }
  }

  // AF-5 (backfill a new harness): --add-harness takes no skill/group name
  // and no --harness (that flag seeds a manifest-less project's *initial*
  // harness set, per 0015-import-harness-selection-flag.md — a distinct
  // operation from adding one more harness to a project that already has a
  // manifest).
  if (addHarness !== undefined) {
    if (positional.length > 0) {
      return {
        error: `"--add-harness" cannot be combined with a skill/group name ("${positional[0]}")`,
      };
    }
    if (harnessArg !== undefined) {
      return {
        error: '"--add-harness" cannot be combined with "--harness"',
      };
    }
    return {
      targetName: undefined,
      spec: { kind: "none" },
      targetPath: resolve(targetPath),
      harnessArg: undefined,
      addHarness,
    };
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
    addHarness: undefined,
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

// UC-3 step 3, factored out for reuse by --add-harness (AF-5): resolve an
// already-persisted session, or prompt and validate a new one. Returns
// either the resolved token or a reportable error string (unprefixed —
// callers prepend their own "hatch import: ... — nothing was changed.").
async function authenticate(): Promise<{ token: string } | { error: string }> {
  const existing = resolveToken();
  if (existing) {
    return { token: existing };
  }

  const candidate = (
    await promptHidden("Registry personal access token: ")
  ).trim();
  if (!candidate) {
    return { error: "no token provided" };
  }

  const validation = await validateGitHubToken(candidate);
  if (!validation.valid) {
    return {
      error: isNetworkFailure(validation.reason)
        ? `registry unreachable (${validation.reason})`
        : `invalid password (${validation.reason})`,
    };
  }

  writeCredentials(candidate);
  return { token: candidate };
}

export async function runImport(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch import: ${parsed.error} — nothing was changed.`);
    return 1;
  }
  const { targetName: name, spec, targetPath, harnessArg, addHarness } = parsed;

  if (!existsSync(targetPath)) {
    console.error(
      `hatch import: target project "${targetPath}" does not exist — nothing was changed.`,
    );
    return 1;
  }

  if (addHarness !== undefined) {
    return runAddHarness(addHarness, targetPath);
  }
  if (name === undefined) {
    // Unreachable: parseArgs guarantees targetName is set whenever
    // addHarness isn't — narrows the type for every use of `name` below.
    throw new Error("unreachable: missing skill/group name");
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
  const authResult = await authenticate();
  if ("error" in authResult) {
    console.error(`hatch import: ${authResult.error} — nothing was changed.`);
    return 1;
  }
  const token = authResult.token;

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

    // 0021-block-first-time-import-of-removed-target.md: a fresh (never
    // before imported) standalone skill or group named directly on the
    // command line is refused outright when it's flagged removed — distinct
    // from AF-4's warn-only treatment of something already relied upon.
    // Re-imports and a group member merely encountered during resolution
    // are unaffected; both remain AF-4's existing warn-only path.
    if (!existingEntry && meta.removed) {
      console.error(
        `hatch import: "${name}" is marked removed in the registry and cannot be imported for the first time — nothing was changed.`,
      );
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
          (candidate) => checkFolderExists(token, candidate),
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
          (p) => !isRegistryOnlyFile(p),
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
          if (isRegistryOnlyFile(relativePath)) {
            continue; // registry metadata/authoring content, never deployed
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
      // registry-only files and anything that hit AF-6 skip/suffix handling
      // above.
      const primaryFiles = target.filesByHarness.get(primaryHarness) as Map<
        string,
        string
      >;
      const entries: Array<[string, string]> = [
        ...primaryFiles.entries(),
      ].filter(
        ([relativePath]) =>
          !isRegistryOnlyFile(relativePath) &&
          !excludedFromHash.has(relativePath),
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

// AF-5: validates the harness code, adds it to the manifest, and backfills
// every already-imported skill/group's content into its folder — always at
// the version already recorded in the manifest, never "latest", so backfill
// can never itself trigger an update. A standalone skill re-resolves its
// harness-suffix variant fresh for the new harness
// (0001-harness-suffix-convention.md: the new harness may prefer a
// differently-suffixed sibling, or no suffixed sibling at all, than any
// harness already declared). A group is re-unpacked fresh via
// resolveGroupMembers (0013, 0016) at its own recorded version — the same
// mechanism a normal import already uses, since a group member's pointer
// resolution is defined to run fresh on every unpack, never a persisted
// commitment (0016).
async function runAddHarness(
  harnessName: string,
  targetPath: string,
): Promise<number> {
  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      "hatch import: no hatch.manifest.json found in this project — run `hatch import --harness <name>` first — nothing was changed.",
    );
    return 1;
  }

  const originalManifestRaw = readFileSync(manifestPath, "utf8");
  const existingManifest = migrateManifest(JSON.parse(originalManifestRaw));

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
  const existingHarnesses = recorded as string[];

  if (!isKnownHarness(harnessName)) {
    console.error(
      `hatch import: unrecognized harness "${harnessName}" — nothing was changed.`,
    );
    return 1;
  }
  if (existingHarnesses.includes(harnessName)) {
    console.log(
      `hatch import: harness "${harnessName}" is already added to this project — nothing to do.`,
    );
    return 0;
  }

  const existingSkills: Record<string, SkillEntry> =
    existingManifest.skills && typeof existingManifest.skills === "object"
      ? (existingManifest.skills as Record<string, SkillEntry>)
      : {};

  // UC-3 step 2: auto-init git if the target somehow isn't a repo yet — a
  // project with an existing manifest almost always already is one, but
  // this mirrors the main flow's own defensive handling rather than assume.
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
  const authResult = await authenticate();
  if ("error" in authResult) {
    console.error(`hatch import: ${authResult.error} — nothing was changed.`);
    return 1;
  }
  const token = authResult.token;

  // AF-4: same deprecation/removal check every invocation performs,
  // independent of this run's primary operation.
  const removedWarnings = await checkRemovedFlags(
    token,
    Object.keys(existingSkills),
  );
  for (const warning of removedWarnings) {
    console.log(`hatch import: warning: ${warning}`);
  }

  // A group's own top-level entry has no folder of its own on disk — only
  // its members (entries whose `group` field names it) are placed, exactly
  // as a normal import unpacks a group flat (0013). Distinguishing a
  // standalone skill's own entry from a group's own bookkeeping entry uses
  // the same "does anything else point its group field at this name" test
  // remove.ts uses for the equivalent problem.
  const groupNames = new Set(
    Object.values(existingSkills)
      .map((entry) => entry?.group)
      .filter((g): g is string => g !== undefined),
  );
  const standaloneNames = Object.keys(existingSkills).filter(
    (skillName) =>
      existingSkills[skillName]?.group === undefined &&
      !groupNames.has(skillName),
  );
  const groupTargetNames = [...groupNames];

  // Phase 1: resolve and fetch everything needed, without writing anything
  // to disk yet — any failure here still leaves "nothing changed".
  const backfillFiles = new Map<string, Map<string, string>>();
  try {
    for (const skillName of standaloneNames) {
      const entry = existingSkills[skillName] as SkillEntry;
      const folderName = await resolveSkillFolderName(
        skillName,
        harnessName,
        (candidate) => checkFolderExists(token, candidate),
      );
      if (!folderName) {
        console.error(
          `hatch import: "${skillName}" was not found in the registry for harness "${harnessName}" — nothing was changed.`,
        );
        return 1;
      }
      const fetchRef = `${skillName}@${entry.version}`;
      const result = await fetchRegistryFolder(token, folderName, fetchRef);
      if (!result.ok) {
        console.error(
          `hatch import: ${fetchFailureMessage(result)} — nothing was changed.`,
        );
        return 1;
      }
      backfillFiles.set(skillName, result.files);
    }

    for (const groupName of groupTargetNames) {
      const groupEntry = existingSkills[groupName] as SkillEntry;
      const fetchRef = `${groupName}@${groupEntry.version}`;
      const rootFolderFetch = await fetchRegistryFolder(
        token,
        groupName,
        fetchRef,
      );
      if (!rootFolderFetch.ok) {
        console.error(
          `hatch import: ${fetchFailureMessage(rootFolderFetch)} — nothing was changed.`,
        );
        return 1;
      }
      const meta = parseGroupSkillJson(
        rootFolderFetch.files.get("skill.json"),
        groupName,
      );
      if (!meta.members) {
        console.error(
          `hatch import: "${groupName}" is recorded as a group but its registry entry at v${groupEntry.version} no longer has members — nothing was changed.`,
        );
        return 1;
      }
      const resolveResult = await resolveGroupMembers(
        token,
        groupName,
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
      const resolvedByName = new Map(
        resolveResult.members.map((member) => [member.name, member]),
      );
      const recordedMemberNames = Object.keys(existingSkills).filter(
        (skillName) => existingSkills[skillName]?.group === groupName,
      );
      for (const memberName of recordedMemberNames) {
        const member = resolvedByName.get(memberName);
        if (!member) {
          console.error(
            `hatch import: "${memberName}" (a member of group "${groupName}") could not be re-resolved at v${groupEntry.version} — nothing was changed.`,
          );
          return 1;
        }
        backfillFiles.set(memberName, member.files);
      }
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

  // Phase 2: place everything, update the manifest, commit once — rolled
  // back entirely on any failure from here on. Every destination under the
  // new harness folder is, by definition, a first-time placement for that
  // harness (it was never declared before this run) — so AF-6's
  // destination-occupied handling applies uniformly here, unlike the main
  // flow's update path, which skips it for content already known Hatch-placed.
  const interactive = Boolean(process.stdin.isTTY);
  const conflictOutcomes: ConflictOutcome[] = [];
  const writtenFiles: string[] = [];
  const excludedFromHashByItem = new Map<string, Set<string>>();
  try {
    const definition = getHarnessDefinition(harnessName);
    const placedNames: string[] = [];
    for (const [itemName, files] of backfillFiles) {
      const skillDestDir = join(targetPath, definition.skillsDir, itemName);
      const excludedFromHash = new Set<string>();

      for (const [relativePath, content] of files) {
        if (isRegistryOnlyFile(relativePath)) {
          continue; // registry metadata/authoring content, never deployed
        }
        let destFile = join(skillDestDir, relativePath);

        if (existsSync(destFile)) {
          const decision = await resolveDestinationConflict(
            destFile,
            interactive,
          );
          if (decision === "skip") {
            conflictOutcomes.push({ destFile, outcome: "skipped" });
            excludedFromHash.add(relativePath);
            continue;
          }
          const finalPath = resolveAvailableSuffixedPath(destFile);
          conflictOutcomes.push({
            destFile,
            outcome: "suffixed",
            finalPath,
          });
          excludedFromHash.add(relativePath);
          destFile = finalPath;
        }

        mkdirSync(dirname(destFile), { recursive: true });
        writeFileSync(destFile, content, "utf8");
        writtenFiles.push(destFile);
      }
      excludedFromHashByItem.set(itemName, excludedFromHash);
      placedNames.push(itemName);
    }

    // 0018-manifest-content-hash-local-edit-detection.md: contentHash is
    // defined as computed from the *primary* declared harness's placed
    // content (alphabetically first of the manifest's harnesses). Adding a
    // harness can make it the new primary — when it does, every
    // already-recorded hash is recomputed from this freshly-placed
    // (guaranteed-clean) content, or a later local-edit check would compare
    // it against the wrong harness's folder and misreport drift that was
    // never actually introduced.
    const newHarnesses = [...existingHarnesses, harnessName].sort();
    const newPrimaryHarness = newHarnesses[0] as string;

    // harnessName is new — it wasn't in existingHarnesses at all — so
    // newPrimaryHarness === harnessName implies primary just changed to it.
    // Anything else (primary staying the same, or another already-declared
    // harness becoming primary) leaves every existing contentHash valid
    // exactly as recorded, since neither folder it could reference changed.
    const newSkills: Record<string, SkillEntry> = { ...existingSkills };
    if (newPrimaryHarness === harnessName) {
      for (const [itemName, files] of backfillFiles) {
        const entry = newSkills[itemName];
        if (!entry?.contentHash) {
          continue;
        }
        const excluded = excludedFromHashByItem.get(itemName) ?? new Set();
        const entries: Array<[string, string]> = [...files.entries()].filter(
          ([relativePath]) =>
            !isRegistryOnlyFile(relativePath) && !excluded.has(relativePath),
        );
        newSkills[itemName] = { ...entry, contentHash: hashEntries(entries) };
      }
    }

    const newManifest = migrateManifest({
      schemaVersion: 1,
      harnesses: newHarnesses,
      skills: newSkills,
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(newManifest, null, 2)}\n`,
      "utf8",
    );

    await git.add(".");
    await git.commit(
      `hatch import: add harness "${harnessName}" (${placedNames.length} item${placedNames.length === 1 ? "" : "s"} backfilled)`,
    );

    console.log(
      `hatch import: added harness "${harnessName}" — backfilled ${placedNames.length} item(s): ${placedNames.join(", ")}.`,
    );
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
  } catch (error) {
    for (const file of writtenFiles) {
      rmSync(file, { force: true });
    }
    writeFileSync(manifestPath, originalManifestRaw, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch import: failed to add harness "${harnessName}" (${message}) — nothing was changed.`,
    );
    return 1;
  }
}
