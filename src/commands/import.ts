// `hatch import` (UC-3): imports a single named standalone skill, or a whole
// group atomically, into a project `hatch init` has already initialized —
// authenticating if needed, fetching the target per harness (for a
// standalone skill, resolving harness-suffixed vs. plain variants) or
// resolving the target's full member graph (for a group, per
// 0013-registry-group-structure-and-permanence.md and
// 0016-group-member-manifest-format.md), placing it, updating the manifest,
// and committing once when the project is version-controlled.
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
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { authenticate } from "../auth/authenticate.js";
import { promptLine } from "../cli/prompt.js";
import {
  getHarnessDefinition,
  isKnownHarness,
  resolveSkillFolderName,
} from "../harness-registry.js";
import {
  hashDiskTree,
  hashEntries,
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
  type FileSnapshot,
  createSnapshot,
  restoreSnapshot,
  snapshotTree,
  treeIsEmpty,
} from "../project/file-snapshot.js";
import { isTestProject } from "../project/test-project.js";
import {
  type VersionControl,
  openVersionControl,
} from "../project/version-control.js";
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
import {
  declaresTesting,
  isTestingSkillName,
} from "../registry/testing-skill.js";

interface ParsedArgs {
  // Exactly one of targetName/addHarness is set — parseArgs enforces this.
  targetName: string | undefined;
  spec: PinSpec;
  targetPath: string;
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

// Everything one run has done to the project that a failure has to undo, in
// the four shapes an undo takes. Held in one place so every rollback — the
// main placement path's, the pin-only path's, and a refusal that happens
// after the migration pass — puts back exactly the same things.
interface UndoLog {
  // Files this run wrote, removed individually: their directories may hold
  // content this run did not place.
  writtenFiles: string[];
  // Directories relocation moved content into, removed whole. Safe because
  // relocation only ever moves into a destination that was absent.
  relocatedDestinations: string[];
  // Directories the migration pruned once emptied, recreated so a refusal
  // really does leave the project exactly as it found it.
  prunedDirectories: string[];
  // Byte-for-byte copies of everything the migration moved out of or removed,
  // rewritten at their original paths.
  snapshot: FileSnapshot;
}

function createUndoLog(): UndoLog {
  return {
    writtenFiles: [],
    relocatedDestinations: [],
    prunedDirectories: [],
    snapshot: createSnapshot(),
  };
}

// True when this run has not yet touched the project, so a refusal can report
// "nothing was changed" without doing any work to make that true.
function undoIsEmpty(undo: UndoLog): boolean {
  return (
    undo.writtenFiles.length === 0 &&
    undo.relocatedDestinations.length === 0 &&
    undo.prunedDirectories.length === 0 &&
    undo.snapshot.size === 0
  );
}

// Removes whatever this run wrote, puts back whatever it moved or deleted, and
// restores the manifest. Returns undefined on a clean rollback, or the reason
// it could not finish.
//
// Recovery must never throw on its own account: an exception here would
// replace the failure the caller is trying to report with a stack trace, and
// would bury the one condition that matters most — placed content and the
// manifest having ended up describing different states.
function rollback(
  targetPath: string,
  undo: UndoLog,
  manifestPath: string,
  originalManifestRaw: string,
): string | undefined {
  try {
    for (const file of undo.writtenFiles) {
      rmSync(file, { force: true });
    }
    for (const destination of undo.relocatedDestinations) {
      rmSync(destination, { recursive: true, force: true });
    }
    restoreSnapshot(targetPath, undo.snapshot);
    for (const dir of undo.prunedDirectories) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(manifestPath, originalManifestRaw, "utf8");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// The tail a refusal carries once the migration pass may have run: the claim
// every refusal has always made, or — when putting the project back could not
// be completed — a report that the claim no longer holds.
function unchangedTail(restoreFailure: string | undefined): string {
  return restoreFailure === undefined
    ? " — nothing was changed."
    : `, and the migration of this project's harness directories could not be undone (${restoreFailure}) — this project's content may now be split across the directories its harnesses use; compare them before running Hatch again.`;
}

// One entry the migration pass carried across into the harness's current
// directory, held so the summary can name it.
interface RelocatedEntry {
  harness: string;
  from: string;
  to: string;
}

// One entry the migration pass removed from a harness's previously occupied
// directory, held so the summary can name it.
interface ReclaimedEntry {
  harness: string;
  path: string;
}

interface Migration {
  relocated: RelocatedEntry[];
  reclaimed: ReclaimedEntry[];
}

// True when the migration moved or removed a recorded entry — which is a real
// change to the project, and so something to report and to commit, even on a
// run that would otherwise have changed nothing. A directory pruned once
// emptied is not itself work: version control does not track one.
function migrationDidWork(migration: Migration): boolean {
  return migration.relocated.length > 0 || migration.reclaimed.length > 0;
}

// Removes `dir` when it holds nothing at all, recording it so a rollback can
// put it back. Used only to retire a directory the migration has just emptied
// — a directory still holding anything is left exactly as it was found.
function removeIfEmpty(dir: string, undo: UndoLog): boolean {
  if (!existsSync(dir) || readdirSync(dir).length > 0) {
    return false;
  }
  rmSync(dir, { recursive: true, force: true });
  undo.prunedDirectories.push(dir);
  return true;
}

// The manifest names a group as well as its members, but a group has no
// placed content of its own — members are unpacked flat under their own
// names (ADR-0013), and a group's entry carries no contentHash for exactly
// that reason (ADR-0034). A group is recognized the way `hatch remove`
// already recognizes one: by the members pointing back at it, since its own
// entry carries no marker (ADR-0017).
function deployedEntryNames(skills: Record<string, SkillEntry>): string[] {
  const groupNames = new Set(
    Object.values(skills)
      .map((entry) => entry.group)
      .filter((group): group is string => group !== undefined),
  );
  return Object.keys(skills).filter((name) => !groupNames.has(name));
}

// A harness whose recorded directory has moved (harness-registry.json's
// `previousSkillsDir`) leaves content behind at the one it used to occupy:
// content the harness can no longer find, or — once this import places a
// fresh copy — a second, permanently stale copy it still would. Migration
// answers both, per declared harness, in one pass over the entries the
// project's manifest records:
//
//   - present in the previous directory and absent from the current one, the
//     entry is *moved* across. The content on disk is what the manifest's
//     contentHash describes, so moving carries the recorded version, pin and
//     hash over unchanged, needs no network, and preserves a local edit.
//   - present in both, the previous directory's copy is *reclaimed* — the
//     current one is authoritative and is left exactly as it is.
//
// Only recorded entries are touched, never the directory wholesale: the old
// location is an ordinary directory a developer may have put other things in,
// and Hatch has no record of what it placed there beyond the manifest's own
// list. The previously occupied directory and its parent are retired only
// once doing so leaves nothing behind.
//
// "Recorded" means recorded *and deployed*. A group's own manifest entry is
// neither — groups are unpacked flat and only their members are ever placed
// (ADR-0013), so nothing named after a group was written by Hatch under any
// harness directory. Anything sitting at that path is the developer's, and
// `deployedNames` is what keeps this from moving or deleting it.
//
// Every move and every delete is logged first, so import's own rollback puts
// the project back exactly as it found it.
function migrateHarnessDirectories(
  targetPath: string,
  harnesses: string[],
  deployedNames: string[],
  undo: UndoLog,
): Migration {
  const migration: Migration = { relocated: [], reclaimed: [] };
  for (const harness of harnesses) {
    const { skillsDir, previousSkillsDir } = getHarnessDefinition(harness);
    if (previousSkillsDir === undefined) {
      continue;
    }
    const previousDir = join(targetPath, previousSkillsDir);
    // The whole cost of this step for a project that never used the old
    // location — which, before long, is every project.
    if (!existsSync(previousDir)) {
      continue;
    }
    for (const name of deployedNames) {
      const previousEntryDir = join(previousDir, name);
      if (!existsSync(previousEntryDir)) {
        continue;
      }
      const currentEntryDir = join(targetPath, skillsDir, name);

      // A directory holding no file at all is not content — the harness finds
      // nothing in it either way, and version control does not track one. One
      // left in the previous directory is swept up without being reported as
      // reclaimed; one in the current directory does not make the entry
      // "present in both", so the real copy is still carried across.
      if (treeIsEmpty(previousEntryDir)) {
        rmSync(previousEntryDir, { recursive: true, force: true });
        undo.prunedDirectories.push(previousEntryDir);
        continue;
      }

      snapshotTree(targetPath, previousEntryDir, undo.snapshot);

      if (existsSync(currentEntryDir) && !treeIsEmpty(currentEntryDir)) {
        rmSync(previousEntryDir, { recursive: true, force: true });
        migration.reclaimed.push({
          harness,
          path: `${previousSkillsDir}/${name}`,
        });
        continue;
      }

      if (existsSync(currentEntryDir)) {
        rmSync(currentEntryDir, { recursive: true, force: true });
        undo.prunedDirectories.push(currentEntryDir);
      }
      mkdirSync(dirname(currentEntryDir), { recursive: true });
      renameSync(previousEntryDir, currentEntryDir);
      undo.relocatedDestinations.push(currentEntryDir);
      migration.relocated.push({
        harness,
        from: `${previousSkillsDir}/${name}`,
        to: `${skillsDir}/${name}`,
      });
    }
    if (removeIfEmpty(previousDir, undo)) {
      removeIfEmpty(dirname(previousDir), undo);
    }
  }
  return migration;
}

// The migration's own lines in the import summary, in the order the work
// happened: what was carried across, then what was left behind and removed.
function reportMigration(migration: Migration): void {
  for (const entry of migration.relocated) {
    console.log(
      `  moved "${entry.from}" to "${entry.to}" — carried across to the directory the "${entry.harness}" harness now uses.`,
    );
  }
  for (const entry of migration.reclaimed) {
    console.log(
      `  reclaimed "${entry.path}" — removed from the directory the "${entry.harness}" harness no longer uses.`,
    );
  }
}

function migrationCommitMessage(migration: Migration): string {
  return `hatch import: migrate harness directories (${migration.relocated.length} moved, ${migration.reclaimed.length} reclaimed)`;
}

// Concludes a run whose only effect is the migration pass — the paths that
// would otherwise have returned having changed nothing. A migration that did
// work is a real change to the project, so it is committed on its own and
// reported rather than left uncommitted and unmentioned; with nothing
// migrated this is the same no-op it has always been.
async function commitMigrationOnly(
  vc: VersionControl,
  targetPath: string,
  migration: Migration,
  undo: UndoLog,
  manifestPath: string,
  originalManifestRaw: string,
): Promise<number> {
  if (!migrationDidWork(migration)) {
    return 0;
  }
  try {
    await vc.commit(migrationCommitMessage(migration));
  } catch (error) {
    console.error(
      failureMessage(
        "failed to migrate this project's harness directories",
        error,
        rollback(targetPath, undo, manifestPath, originalManifestRaw),
      ),
    );
    return 1;
  }
  reportMigration(migration);
  return 0;
}

// The message for a failed operation, escalated when the rollback itself
// could not complete — in that case "nothing was changed" would be a claim
// the command cannot actually make.
function failureMessage(
  what: string,
  cause: unknown,
  rollbackFailure: string | undefined,
): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return rollbackFailure === undefined
    ? `hatch import: ${what} (${message}) — nothing was changed.`
    : `hatch import: ${what} (${message}), and the rollback could not be completed (${rollbackFailure}) — this project's manifest and its placed content may now describe different states; compare them before running Hatch again.`;
}

// The registry's "no such thing" report, in the two shapes it takes: an
// exact-pin request names the ref, an unpinned one names the harness whose
// folder resolution failed. 0027-testing-skill-convention.md routes its own
// refusal through these same helpers rather than a message of its own, so a
// project that has not opted in cannot tell testing content apart from
// content the registry does not have.
function notFoundPinnedMessage(ref: string): string {
  return `"${ref}" was not found in the registry`;
}

function notFoundForHarnessMessage(name: string, harness: string): string {
  return `"${name}" was not found in the registry for harness "${harness}"`;
}

function unavailableMessage(
  name: string,
  fetchRef: string | undefined,
  primaryHarness: string,
): string {
  return fetchRef
    ? notFoundPinnedMessage(fetchRef)
    : notFoundForHarnessMessage(name, primaryHarness);
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const positional: string[] = [];
  let targetPath = process.cwd();
  let addHarness: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--path requires a value" };
      }
      targetPath = value;
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
  // — it operates on everything the manifest already records.
  if (addHarness !== undefined) {
    if (positional.length > 0) {
      return {
        error: `"--add-harness" cannot be combined with a skill/group name ("${positional[0]}")`,
      };
    }
    return {
      targetName: undefined,
      spec: { kind: "none" },
      targetPath: resolve(targetPath),
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
    addHarness: undefined,
  };
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
  const { targetName: name, spec, targetPath, addHarness } = parsed;

  if (!existsSync(targetPath)) {
    console.error(
      `hatch import: target project "${targetPath}" does not exist — nothing was changed.`,
    );
    return 1;
  }

  // Resolved at entry, before any mutation, so a run that aborts before it
  // would ever have committed still tells the developer there is no
  // recovery point.
  const vc = await openVersionControl("hatch import", targetPath);

  if (addHarness !== undefined) {
    return runAddHarness(addHarness, targetPath, vc);
  }
  if (name === undefined) {
    // Unreachable: parseArgs guarantees targetName is set whenever
    // addHarness isn't — narrows the type for every use of `name` below.
    throw new Error("unreachable: missing skill/group name");
  }

  // A manifest is a precondition, never something import creates
  // (0015-import-harness-selection-flag.md): placement is governed solely
  // by the harnesses the manifest records, never by the filesystem.
  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      "hatch import: no hatch.manifest.json found in this project — run `hatch init --harness <name[,name...]>` first — nothing was changed.",
    );
    return 1;
  }
  const originalManifestRaw = readFileSync(manifestPath, "utf8");
  const existingManifest = migrateManifest(JSON.parse(originalManifestRaw));
  const existingSkills: Record<string, SkillEntry> =
    typeof existingManifest.skills === "object" &&
    existingManifest.skills !== null
      ? (existingManifest.skills as Record<string, SkillEntry>)
      : {};

  // 0027-testing-skill-convention.md: whether this project may import
  // testing content. Read here with the rest of the manifest; the refusal
  // itself happens further down, after authentication.
  const allowTesting = isTestProject(existingManifest);

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
  const sortedHarnesses = [...(recorded as string[])].sort();
  const primaryHarness = sortedHarnesses[0];

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

  // Everything this run does to the project, logged as it happens so any
  // refusal or failure below can put the project back exactly as it found it.
  const undo = createUndoLog();

  // Carry each declared harness's content across from a directory it no longer
  // occupies, and reclaim what is left there. Deliberately here: ahead of the
  // staleness and local-edit checks, which hash the harness's *current*
  // directory and would otherwise read an entry that still lives in the
  // previous one as an empty tree — reporting a local edit nobody made and
  // returning before any of this could run.
  let migration: Migration;
  try {
    migration = migrateHarnessDirectories(
      targetPath,
      sortedHarnesses,
      deployedEntryNames(existingSkills),
      undo,
    );
  } catch (error) {
    console.error(
      failureMessage(
        "failed to migrate this project's harness directories",
        error,
        rollback(targetPath, undo, manifestPath, originalManifestRaw),
      ),
    );
    return 1;
  }

  // The tail of a refusal reached after the migration pass: it puts the
  // project back first, so "nothing was changed" stays true.
  const undoMigration = (): string =>
    undoIsEmpty(undo)
      ? " — nothing was changed."
      : unchangedTail(
          rollback(targetPath, undo, manifestPath, originalManifestRaw),
        );

  // AF-10: a bare re-import of a standing exact pin skips the update check
  // entirely — no fetch of the primary target at all.
  if (spec.kind === "none" && existingEntry?.pin?.type === "exact") {
    console.log(
      `hatch import: "${name}" is pinned at v${existingEntry.pin.value} — left untouched.`,
    );
    return commitMigrationOnly(
      vc,
      targetPath,
      migration,
      undo,
      manifestPath,
      originalManifestRaw,
    );
  }

  const newPin = resolvePin(spec, existingEntry?.pin);
  const fetchRef = spec.kind === "exact" ? `${name}@${spec.value}` : undefined;

  // 0027-testing-skill-convention.md: to a project that has not opted in,
  // testing content simply does not exist — the same message and the same
  // exit code as any name the registry doesn't have. Deciding it here,
  // after authentication and after AF-4's warnings, is what makes the two
  // indistinguishable from outside.
  if (!allowTesting && isTestingSkillName(name)) {
    console.error(
      `hatch import: ${unavailableMessage(name, fetchRef, primaryHarness)}${undoMigration()}`,
    );
    return 1;
  }

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
        `hatch import: ${fetchFailureMessage(classifyResult)}${undoMigration()}`,
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
        `hatch import: ${notFoundPinnedMessage(fetchRef)}${undoMigration()}`,
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
      console.error(`hatch import: ${message}${undoMigration()}`);
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
        `hatch import: "${name}" is marked removed in the registry and cannot be imported for the first time${undoMigration()}`,
      );
      return 1;
    }

    // 0027-testing-skill-convention.md: the backstop for content that
    // reached the registry without the reserved prefix, reported exactly as
    // the name check above reports it.
    if (!allowTesting && declaresTesting(meta)) {
      console.error(
        `hatch import: ${unavailableMessage(name, fetchRef, primaryHarness)}${undoMigration()}`,
      );
      return 1;
    }

    if (meta.members) {
      isGroup = true;

      // AF-1/AF-2 at the group level is decided *after* resolution, not
      // before it. An unchanged group version used to imply nothing about
      // its members had changed, because every member resolved to either a
      // fixed pin or whatever the group's own version carried. A
      // caret-constrained pointer breaks that implication: it resolves
      // against the registry's current tags, so a member can move while the
      // group itself stands still. The only way to know whether anything
      // changed is to resolve the member graph and compare.
      if (
        spec.kind !== "exact" &&
        existingEntry &&
        !isNewerCompatible(existingEntry.version, meta.version) &&
        !pinsEqual(newPin, existingEntry.pin)
      ) {
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
            `hatch import: ${fetchFailureMessage(rootFolderFetch)}${undoMigration()}`,
          );
          return 1;
        }

        const resolveResult = await resolveGroupMembers(
          token,
          name,
          meta.version,
          meta.members,
          rootFolderFetch.files,
          { allowTesting },
        );
        if (!resolveResult.ok) {
          console.error(
            `hatch import: ${fetchFailureMessage(resolveResult)}${undoMigration()}`,
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
            // Hashed from what is actually on disk, never from the incoming
            // version's file list: the stored hash was computed from the
            // files the *previous* version placed, so hashing the new
            // version's list against the old tree compares two different
            // file sets. A file the new version adds does not exist on disk
            // yet and would hash as empty, reporting a local edit nobody
            // made — and then repeating it on every later import, because
            // the update it blocks is what would have placed the file.
            const onDiskHash = hashDiskTree(memberDir);
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

        // The no-op half of AF-1, now decided on evidence: the group sits
        // at its recorded version, no pin changed, and every member
        // resolved to exactly what the project already has. Local edits
        // disqualify the shortcut so the normal path can report them.
        if (
          spec.kind !== "exact" &&
          existingEntry &&
          !isNewerCompatible(existingEntry.version, meta.version) &&
          pinsEqual(newPin, existingEntry.pin) &&
          skippedLocalEdits.length === 0 &&
          placementTargets.every(
            (target) => existingSkills[target.name]?.version === target.version,
          )
        ) {
          console.log(
            `hatch import: "${name}" is already up to date (v${existingEntry.version}).`,
          );
          return commitMigrationOnly(
            vc,
            targetPath,
            migration,
            undo,
            manifestPath,
            originalManifestRaw,
          );
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
            `hatch import: ${notFoundForHarnessMessage(name, harness)}${undoMigration()}`,
          );
          return 1;
        }
        resolvedFolders.set(harness, folderName);
      }
    } catch (error) {
      if (error instanceof RegistryUnreachableError) {
        console.error(
          `hatch import: registry unreachable (${error.message})${undoMigration()}`,
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
          `hatch import: ${fetchFailureMessage(primaryMeta)}${undoMigration()}`,
        );
        return 1;
      }
      const latestVersion = extractSkillVersionFromRaw(primaryMeta.content);
      if (!isNewerCompatible(existingEntry.version, latestVersion)) {
        if (pinsEqual(newPin, existingEntry.pin)) {
          console.log(
            `hatch import: "${name}" is already up to date (v${existingEntry.version}).`,
          );
          return commitMigrationOnly(
            vc,
            targetPath,
            migration,
            undo,
            manifestPath,
            originalManifestRaw,
          );
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
            `hatch import: ${fetchFailureMessage(result)}${undoMigration()}`,
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
        // Same reasoning as the group-member check above: compare what is
        // on disk against what was recorded, not the incoming version's
        // file list against the previous version's hash.
        const onDiskHash = hashDiskTree(skillDir);
        if (onDiskHash !== existingEntry.contentHash) {
          console.log(
            `hatch import: "${name}" has local edits — left untouched.`,
          );
          return commitMigrationOnly(
            vc,
            targetPath,
            migration,
            undo,
            manifestPath,
            originalManifestRaw,
          );
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
      // The test-project opt-in survives every rewrite of this manifest
      // (0027-testing-skill-convention.md) — the manifest is rebuilt from
      // scratch here, so anything not carried across would be dropped.
      ...(allowTesting ? { testProject: true } : {}),
      skills: { ...existingSkills, [name]: entry },
    });
    try {
      writeFileSync(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      await vc.commit(
        newPin
          ? `hatch import: pin "${name}" to ${newPin.type === "exact" ? "v" : ">=v"}${newPin.value}`
          : `hatch import: clear the version pin for "${name}"`,
      );
    } catch (error) {
      console.error(
        failureMessage(
          `failed to update the pin for "${name}"`,
          error,
          rollback(targetPath, undo, manifestPath, originalManifestRaw),
        ),
      );
      return 1;
    }
    console.log(
      newPin
        ? `hatch import: "${name}" recorded as ${newPin.type === "exact" ? "exactly pinned" : "range-pinned"} at v${newPin.value} (already at v${(existingEntry as SkillEntry).version}).`
        : `hatch import: cleared the version pin for "${name}" (still at v${(existingEntry as SkillEntry).version}).`,
    );
    // The migration rode along in the commit above, so it is reported here
    // rather than committed again.
    reportMigration(migration);
    return 0;
  }

  const interactive = Boolean(process.stdin.isTTY);
  const conflictOutcomes: ConflictOutcome[] = [];
  const contentHashes = new Map<string, string>();
  const writtenFiles = undo.writtenFiles;

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
      // The test-project opt-in survives every rewrite of this manifest
      // (0027-testing-skill-convention.md) — the manifest is rebuilt from
      // scratch here, so anything not carried across would be dropped.
      ...(allowTesting ? { testProject: true } : {}),
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
    const commitMessage = !existingEntry
      ? isGroup
        ? `hatch import: add group "${name}" (${placementTargets.length} member${placementTargets.length === 1 ? "" : "s"})`
        : `hatch import: add "${name}"`
      : isGroup
        ? `hatch import: update group "${name}" (v${existingEntry.version} → v${rootGroupVersion})`
        : `hatch import: update "${name}" (v${existingEntry.version} → v${(placementTargets[0] as PlacementTarget).version})`;
    await vc.commit(commitMessage);
  } catch (error) {
    console.error(
      failureMessage(
        `failed to import "${name}"`,
        error,
        rollback(targetPath, undo, manifestPath, originalManifestRaw),
      ),
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
  reportMigration(migration);

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
  vc: VersionControl,
): Promise<number> {
  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      "hatch import: no hatch.manifest.json found in this project — run `hatch init --harness <name[,name...]>` first — nothing was changed.",
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
        // Backfilling content this project already has: a test project's
        // recorded testing groups re-resolve exactly as ordinary ones do
        // (0027-testing-skill-convention.md).
        { allowTesting: isTestProject(existingManifest) },
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
  // Backfill only ever writes; it moves and removes nothing, so its undo log
  // carries written files alone.
  const undo = createUndoLog();
  const writtenFiles = undo.writtenFiles;
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
      // The test-project opt-in survives every rewrite of this manifest
      // (0027-testing-skill-convention.md) — the manifest is rebuilt from
      // scratch here, so anything not carried across would be dropped.
      ...(isTestProject(existingManifest) ? { testProject: true } : {}),
      skills: newSkills,
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(newManifest, null, 2)}\n`,
      "utf8",
    );

    await vc.commit(
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
    console.error(
      failureMessage(
        `failed to add harness "${harnessName}"`,
        error,
        rollback(targetPath, undo, manifestPath, originalManifestRaw),
      ),
    );
    return 1;
  }
}
