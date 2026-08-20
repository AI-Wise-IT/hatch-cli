// `hatch remove` (UC-4): removes a previously-imported standalone skill, or
// a whole group, from an existing project — deleting its placed content
// from every declared harness folder, dropping its manifest entry/entries,
// and committing once when the project is version-controlled. Also removes
// a whole harness (`--harness <name>`), dropping its placed content for
// every already-imported skill/group and the harness itself from the
// manifest.
//
// Both paths snapshot what they are about to delete before deleting it, and
// restore from that snapshot on failure — the "nothing was changed"
// guarantee holds whether or not the project has a repository.
// Batch 8 scope: UC-4 main flow, AF-1 (not imported), AF-2 (manifest/disk
// drift), AF-3 (local edits present), AF-4 (target is a skill belonging to
// a group — refused, the group is named instead).
// Batch 9 scope (this batch): AF-5, `--harness <name>` (dropping a harness).
//
// Per 0022-remove-force-flags-not-prompt.md: AF-2/AF-3 are never gated by an
// interactive prompt, in either a standalone or a group removal. By default,
// any item in the removal's target set (the single named skill, or every
// member of a named group) found missing or locally edited aborts the whole
// operation — nothing removed, nothing committed — naming every affected
// item. `--force-all` removes every target-set item regardless of
// drift/edits; `--force-clean` removes only the clean ones, leaving any
// dirty item in place with a warning (a no-op, not a failure, if every item
// turns out dirty).
//
// Per 0023-remove-harness-drop-unconditional.md: `--harness <name>` is
// unconditional — no AF-2/AF-3-style drift/local-edit gating, no
// `--force-all`/`--force-clean` involvement. Its only precondition is UC-4's
// "a project must always declare at least one harness" business rule.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getHarnessDefinition, isKnownHarness } from "../harness-registry.js";
import {
  diskTreeIsEmpty,
  hashDiskTree,
} from "../manifest-migrations/content-hash.js";
import { migrateManifest } from "../manifest-migrations/index.js";
import {
  type FileSnapshot,
  createSnapshot,
  restoreSnapshot,
  snapshotTree,
} from "../project/file-snapshot.js";
import { isTestProject } from "../project/test-project.js";
import {
  type VersionControl,
  openVersionControl,
} from "../project/version-control.js";

interface ParsedArgs {
  // Exactly one of targetName/harnessName is set — parseArgs enforces this.
  targetName: string | undefined;
  harnessName: string | undefined;
  targetPath: string;
  force: "all" | "clean" | undefined;
}

// The manifest's per-name entry shape as of schema v3 — see import.ts's own
// copy of this shape for the full field-by-field rationale; remove.ts only
// ever reads `group` and `contentHash`, never `version` or `pin`.
interface SkillEntry {
  version: string;
  group?: string;
  contentHash?: string;
}

interface TargetItem {
  name: string;
  contentHash: string | undefined;
}

type ItemStatus = "clean" | "missing" | "edited";

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const positional: string[] = [];
  let targetPath = process.cwd();
  let force: "all" | "clean" | undefined;
  let harnessName: string | undefined;

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
      harnessName = value;
    } else if (arg === "--force-all") {
      if (force === "clean") {
        return {
          error: '"--force-all" and "--force-clean" cannot be combined',
        };
      }
      force = "all";
    } else if (arg === "--force-clean") {
      if (force === "all") {
        return {
          error: '"--force-all" and "--force-clean" cannot be combined',
        };
      }
      force = "clean";
    } else if (arg.startsWith("--")) {
      return { error: `unrecognized option "${arg}"` };
    } else {
      positional.push(arg);
    }
  }

  // AF-5 (0023-remove-harness-drop-unconditional.md): --harness takes no
  // skill/group name and no force flag — it's a distinct operation from the
  // named-target removal below, not a modifier on it.
  if (harnessName !== undefined) {
    if (positional.length > 0) {
      return {
        error: `"--harness" cannot be combined with a skill/group name ("${positional[0]}")`,
      };
    }
    if (force) {
      return {
        error: `"--harness" cannot be combined with "--force-${force}"`,
      };
    }
    return {
      targetName: undefined,
      harnessName,
      targetPath: resolve(targetPath),
      force: undefined,
    };
  }

  if (positional.length === 0) {
    return { error: "a skill or group name is required" };
  }
  if (positional.length > 1) {
    return { error: `unexpected extra argument "${positional[1]}"` };
  }

  return {
    targetName: positional[0] as string,
    harnessName: undefined,
    targetPath: resolve(targetPath),
    force,
  };
}

// Puts back everything the command deleted, then the manifest it may have
// rewritten. Returns undefined on a clean rollback, or the reason it could
// not finish.
//
// Recovery must never throw on its own account: an exception here would
// replace the failure the caller is trying to report with a stack trace,
// and would bury the one condition that matters most — placed content and
// the manifest having ended up describing different states, which is
// exactly what contentHash drift detection is built to distrust.
function rollback(
  targetPath: string,
  snapshot: FileSnapshot,
  manifestPath: string,
  originalManifestRaw: string,
): string | undefined {
  try {
    restoreSnapshot(targetPath, snapshot);
    writeFileSync(manifestPath, originalManifestRaw, "utf8");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
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
    ? `hatch remove: ${what} (${message}) — nothing was changed.`
    : `hatch remove: ${what} (${message}), and the rollback could not be completed (${rollbackFailure}) — this project's manifest and its placed content may now describe different states; compare them before running Hatch again.`;
}

function itemStatus(dir: string, item: TargetItem): ItemStatus {
  if (diskTreeIsEmpty(dir)) {
    return "missing";
  }
  if (!item.contentHash) {
    // No baseline recorded (a pre-Batch-7 manifest entry never re-placed
    // since) — nothing to compare against, so this item can't be flagged as
    // edited; grandfathered as clean, mirroring hatch import's own
    // precedent for an absent contentHash (0018).
    return "clean";
  }
  return hashDiskTree(dir) === item.contentHash ? "clean" : "edited";
}

export async function runRemove(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch remove: ${parsed.error} — nothing was changed.`);
    return 1;
  }
  const { targetName, harnessName, targetPath, force } = parsed;

  if (!existsSync(targetPath)) {
    console.error(
      `hatch remove: target project "${targetPath}" does not exist — nothing was changed.`,
    );
    return 1;
  }

  // Resolved at entry, before any mutation — a removal in a project with no
  // version control has no recovery point beyond this command's own
  // rollback, and the developer is told so before it proceeds.
  const vc = await openVersionControl("hatch remove", targetPath);

  if (harnessName !== undefined) {
    return runDropHarness(harnessName, targetPath, vc);
  }
  const name = targetName as string;

  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    console.log(
      `hatch remove: "${name}" was never imported — nothing to remove.`,
    );
    return 0;
  }

  const originalManifestRaw = readFileSync(manifestPath, "utf8");
  const manifest = migrateManifest(JSON.parse(originalManifestRaw));

  const recordedHarnesses = manifest.harnesses;
  if (
    !Array.isArray(recordedHarnesses) ||
    recordedHarnesses.length === 0 ||
    !recordedHarnesses.every((h) => typeof h === "string")
  ) {
    console.error(
      `hatch remove: "${manifestPath}" has no valid harnesses recorded — nothing was changed.`,
    );
    return 1;
  }
  const sortedHarnesses = [...(recordedHarnesses as string[])].sort();
  const primaryHarness = sortedHarnesses[0] as string;

  const skills: Record<string, SkillEntry> =
    manifest.skills && typeof manifest.skills === "object"
      ? (manifest.skills as Record<string, SkillEntry>)
      : {};

  // AF-1: never recorded in the manifest at all.
  const entry = skills[name];
  if (!entry) {
    console.log(
      `hatch remove: "${name}" was never imported — nothing to remove.`,
    );
    return 0;
  }

  // AF-4: a manifest entry with its own `group` field is a group member,
  // never individually removable — the whole group must be targeted
  // instead (0017-manifest-schema-v2-group-membership.md).
  if (entry.group !== undefined) {
    console.error(
      `hatch remove: "${name}" belongs to group "${entry.group}" — remove the whole group instead (hatch remove ${entry.group}) — nothing was changed.`,
    );
    return 1;
  }

  // A group is recognized by scanning for member entries that point back at
  // this name — not by any flag on the group's own entry, which carries no
  // marker of its own (only members are tagged, per 0017).
  const memberNames = Object.keys(skills).filter(
    (skillName) => skills[skillName]?.group === name,
  );
  const isGroup = memberNames.length > 0;

  const targetItems: TargetItem[] = isGroup
    ? memberNames.map((memberName) => ({
        name: memberName,
        contentHash: skills[memberName]?.contentHash,
      }))
    : [{ name, contentHash: entry.contentHash }];

  const dirFor = (itemName: string) =>
    join(targetPath, getHarnessDefinition(primaryHarness).skillsDir, itemName);

  const statuses = new Map<string, ItemStatus>(
    targetItems.map((item) => [item.name, itemStatus(dirFor(item.name), item)]),
  );
  const dirtyItems = targetItems.filter(
    (item) => statuses.get(item.name) !== "clean",
  );

  // 0022-remove-force-flags-not-prompt.md: no flag, and something's dirty —
  // abort the whole operation, nothing removed, nothing committed.
  if (dirtyItems.length > 0 && !force) {
    console.log(
      `hatch remove: "${name}" was not removed — the following item(s) need attention:`,
    );
    for (const item of dirtyItems) {
      const status = statuses.get(item.name);
      console.log(
        status === "missing"
          ? `  "${item.name}" — its placed content is missing from disk.`
          : `  "${item.name}" — has local edits since it was imported.`,
      );
    }
    console.log(
      `Re-run with --force-all to remove ${isGroup ? "the whole group" : "it"} anyway, or --force-clean to remove only unaffected ${isGroup ? "member(s)" : "item(s)"}.`,
    );
    return 0;
  }

  const itemsToRemove =
    force === "clean"
      ? targetItems.filter((item) => statuses.get(item.name) === "clean")
      : targetItems;
  const skippedDirty = targetItems.filter(
    (item) => !itemsToRemove.includes(item),
  );

  if (itemsToRemove.length === 0) {
    console.log(
      `hatch remove: nothing removed — every item in "${name}" has local edits or missing content.`,
    );
    for (const item of skippedDirty) {
      const status = statuses.get(item.name);
      console.log(
        status === "missing"
          ? `  "${item.name}" — its placed content is missing from disk.`
          : `  "${item.name}" — has local edits since it was imported.`,
      );
    }
    return 0;
  }

  const removedNames = new Set(itemsToRemove.map((item) => item.name));
  // A group's own top-level entry is dropped only once every one of its
  // members has actually been removed — leaving a member behind (a
  // --force-clean partial removal) must never leave that member's `group`
  // field pointing at an entry that no longer exists in the manifest.
  const groupFullyRemoved =
    isGroup && memberNames.every((n) => removedNames.has(n));

  // Everything about to be deleted, held in memory so this command can put
  // it back itself — the guarantee holds with or without a repository.
  const snapshot = createSnapshot();
  for (const item of itemsToRemove) {
    for (const harness of sortedHarnesses) {
      snapshotTree(
        targetPath,
        join(targetPath, getHarnessDefinition(harness).skillsDir, item.name),
        snapshot,
      );
    }
  }

  try {
    for (const item of itemsToRemove) {
      for (const harness of sortedHarnesses) {
        rmSync(
          join(targetPath, getHarnessDefinition(harness).skillsDir, item.name),
          { recursive: true, force: true },
        );
      }
    }

    const newSkills: Record<string, SkillEntry> = { ...skills };
    for (const removedName of removedNames) {
      delete newSkills[removedName];
    }
    if (groupFullyRemoved) {
      delete newSkills[name];
    }

    const newManifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      // The test-project opt-in survives every rewrite of this manifest
      // (0027-testing-skill-convention.md) — the manifest is rebuilt from
      // scratch here, so anything not carried across would be dropped.
      ...(isTestProject(manifest) ? { testProject: true } : {}),
      skills: newSkills,
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(newManifest, null, 2)}\n`,
      "utf8",
    );

    const commitMessage = isGroup
      ? groupFullyRemoved
        ? `hatch remove: remove group "${name}" (${itemsToRemove.length} member${itemsToRemove.length === 1 ? "" : "s"})`
        : `hatch remove: remove ${itemsToRemove.length} member(s) of group "${name}"`
      : `hatch remove: remove "${name}"`;
    await vc.commit(commitMessage);
  } catch (error) {
    console.error(
      failureMessage(
        `failed to remove "${name}"`,
        error,
        rollback(targetPath, snapshot, manifestPath, originalManifestRaw),
      ),
    );
    return 1;
  }

  // Summary.
  if (isGroup) {
    console.log(
      `hatch remove: removed group "${name}" — ${itemsToRemove.length} member(s) removed from harness(es) ${sortedHarnesses.join(", ")}.`,
    );
    for (const item of itemsToRemove) {
      console.log(`  "${item.name}" removed.`);
    }
    for (const item of skippedDirty) {
      const status = statuses.get(item.name);
      console.log(
        status === "missing"
          ? `  "${item.name}" — its placed content is missing from disk; left untouched.`
          : `  "${item.name}" — has local edits; left untouched.`,
      );
    }
    if (!groupFullyRemoved) {
      console.log(
        `  group "${name}" still has member(s) left in place — its manifest entry was kept.`,
      );
    }
  } else {
    console.log(
      `hatch remove: removed "${name}" from harness(es) ${sortedHarnesses.join(", ")}.`,
    );
  }

  return 0;
}

// AF-5 (0023-remove-harness-drop-unconditional.md): drops a whole harness —
// checks only that it isn't the project's only declared harness, then
// unconditionally removes that harness's placed content for every
// already-imported skill/group and drops it from the manifest. No
// AF-2/AF-3-style drift/local-edit gating, no --force-all/--force-clean
// involvement (those remain scoped to the named-target path above, per
// 0022-remove-force-flags-not-prompt.md).
async function runDropHarness(
  harnessName: string,
  targetPath: string,
  vc: VersionControl,
): Promise<number> {
  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    console.log(
      "hatch remove: no hatch.manifest.json found in this project — nothing to remove.",
    );
    return 0;
  }

  const originalManifestRaw = readFileSync(manifestPath, "utf8");
  const manifest = migrateManifest(JSON.parse(originalManifestRaw));

  const recordedHarnesses = manifest.harnesses;
  if (
    !Array.isArray(recordedHarnesses) ||
    recordedHarnesses.length === 0 ||
    !recordedHarnesses.every((h) => typeof h === "string")
  ) {
    console.error(
      `hatch remove: "${manifestPath}" has no valid harnesses recorded — nothing was changed.`,
    );
    return 1;
  }
  const harnesses = recordedHarnesses as string[];

  if (!isKnownHarness(harnessName)) {
    console.error(
      `hatch remove: unrecognized harness "${harnessName}" — nothing was changed.`,
    );
    return 1;
  }

  if (!harnesses.includes(harnessName)) {
    console.log(
      `hatch remove: "${harnessName}" is not a declared harness in this project — nothing to remove.`,
    );
    return 0;
  }

  // UC-4 Business Rules: a project must always declare at least one
  // harness — this is the only precondition AF-5 checks.
  if (harnesses.length === 1) {
    console.error(
      `hatch remove: cannot drop harness "${harnessName}" — a project must always declare at least one harness — nothing was changed.`,
    );
    return 1;
  }

  const oldPrimaryHarness = [...harnesses].sort()[0] as string;
  const newHarnesses = harnesses.filter((h) => h !== harnessName).sort();
  const newPrimaryHarness = newHarnesses[0] as string;

  const skills: Record<string, SkillEntry> =
    manifest.skills && typeof manifest.skills === "object"
      ? (manifest.skills as Record<string, SkillEntry>)
      : {};

  // Every entry that corresponds to actually-placed content on disk: a
  // standalone skill, or a group member (has its own `group` field). A
  // group's own top-level entry is pure bookkeeping (0017-manifest-schema-
  // v2-group-membership.md) — it has no folder of its own to remove.
  const groupNames = new Set(
    Object.values(skills)
      .map((entry) => entry?.group)
      .filter((g): g is string => g !== undefined),
  );
  const itemsWithContent = Object.keys(skills).filter(
    (skillName) =>
      skills[skillName]?.group !== undefined || !groupNames.has(skillName),
  );

  const newSkills: Record<string, SkillEntry> = { ...skills };

  // Every file this drop is about to delete, so a mid-operation failure is
  // recoverable without a repository.
  const snapshot = createSnapshot();
  for (const itemName of itemsWithContent) {
    snapshotTree(
      targetPath,
      join(targetPath, getHarnessDefinition(harnessName).skillsDir, itemName),
      snapshot,
    );
  }

  try {
    for (const itemName of itemsWithContent) {
      rmSync(
        join(targetPath, getHarnessDefinition(harnessName).skillsDir, itemName),
        { recursive: true, force: true },
      );
    }

    // 0018-manifest-content-hash-local-edit-detection.md: a contentHash is
    // defined as computed from the *primary* declared harness's placed
    // content (alphabetically first of the manifest's harnesses). Dropping
    // a harness can change which remaining harness is primary — when it
    // does, every already-recorded hash is recomputed against the new
    // primary's own (untouched) on-disk content, or a later local-edit
    // check would compare it against the wrong harness's folder and
    // misreport drift that was never actually introduced.
    if (newPrimaryHarness !== oldPrimaryHarness) {
      for (const itemName of itemsWithContent) {
        const entry = newSkills[itemName];
        if (!entry?.contentHash) {
          continue;
        }
        const dir = join(
          targetPath,
          getHarnessDefinition(newPrimaryHarness).skillsDir,
          itemName,
        );
        if (!diskTreeIsEmpty(dir)) {
          newSkills[itemName] = { ...entry, contentHash: hashDiskTree(dir) };
        }
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

    await vc.commit(
      `hatch remove: drop harness "${harnessName}" (${itemsWithContent.length} item${itemsWithContent.length === 1 ? "" : "s"})`,
    );
  } catch (error) {
    console.error(
      failureMessage(
        `failed to drop harness "${harnessName}"`,
        error,
        rollback(targetPath, snapshot, manifestPath, originalManifestRaw),
      ),
    );
    return 1;
  }

  console.log(
    `hatch remove: dropped harness "${harnessName}" — removed its placed content for ${itemsWithContent.length} item(s); remaining harness(es): ${newHarnesses.join(", ")}.`,
  );
  return 0;
}
