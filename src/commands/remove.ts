// `hatch remove` (UC-4): removes a previously-imported standalone skill, or
// a whole group, from an existing project — deleting its placed content
// from every declared harness folder, dropping its manifest entry/entries,
// and committing once.
// Batch 8 scope: UC-4 main flow, AF-1 (not imported), AF-2 (manifest/disk
// drift), AF-3 (local edits present), AF-4 (target is a skill belonging to
// a group — refused, the group is named instead). `--harness <name>` (AF-5,
// dropping a harness) is Batch 9.
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

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { simpleGit } from "simple-git";
import { getHarnessDefinition } from "../harness-registry.js";
import {
  diskTreeIsEmpty,
  hashDiskTree,
} from "../manifest-migrations/content-hash.js";
import { migrateManifest } from "../manifest-migrations/index.js";

interface ParsedArgs {
  targetName: string;
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

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--path requires a value" };
      }
      targetPath = value;
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

  if (positional.length === 0) {
    return { error: "a skill or group name is required" };
  }
  if (positional.length > 1) {
    return { error: `unexpected extra argument "${positional[1]}"` };
  }

  return {
    targetName: positional[0] as string,
    targetPath: resolve(targetPath),
    force,
  };
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
  const { targetName: name, targetPath, force } = parsed;

  if (!existsSync(targetPath)) {
    console.error(
      `hatch remove: target project "${targetPath}" does not exist — nothing was changed.`,
    );
    return 1;
  }

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
      skills: newSkills,
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(newManifest, null, 2)}\n`,
      "utf8",
    );

    const git = simpleGit(targetPath);
    await git.add(".");
    const commitMessage = isGroup
      ? groupFullyRemoved
        ? `hatch remove: remove group "${name}" (${itemsToRemove.length} member${itemsToRemove.length === 1 ? "" : "s"})`
        : `hatch remove: remove ${itemsToRemove.length} member(s) of group "${name}"`
      : `hatch remove: remove "${name}"`;
    await git.commit(commitMessage);
  } catch (error) {
    try {
      await simpleGit(targetPath).reset(["--hard", "HEAD"]);
    } catch {
      // Best-effort: the direct manifest restore below still runs
      // regardless of whether this recovery step itself succeeded.
    }
    writeFileSync(manifestPath, originalManifestRaw, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch remove: failed to remove "${name}" (${message}) — nothing was changed.`,
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
