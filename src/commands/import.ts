// `hatch import` (UC-3): imports a single named standalone skill into an
// existing project — auto-initializing git if needed, authenticating if
// needed, fetching the skill per harness (resolving harness-suffixed vs.
// plain variants), placing it, updating the manifest, and committing once.
// Batch 5 scope only: main flow for a single standalone skill (never a
// group — see 0013-registry-group-structure-and-permanence.md, Batch 6),
// AF-6 (destination occupied), AF-7 (registry unreachable), AF-8 (invalid
// password). Re-import/staleness (AF-1..AF-4) is Batch 7; --add-harness
// (AF-5) is Batch 9; pinned-pointer conflicts (AF-9) are group-only, Batch 6.

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
import { migrateManifest } from "../manifest-migrations/index.js";
import {
  type RegistryFetchOk,
  fetchRegistryFolder,
  registryFolderExists,
} from "../registry/fetch.js";

interface ParsedArgs {
  skillName: string;
  targetPath: string;
  harnessArg: string | undefined;
}

interface ConflictOutcome {
  destFile: string;
  outcome: "skipped" | "suffixed";
  finalPath?: string;
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

  return {
    skillName: positional[0],
    targetPath: resolve(targetPath),
    harnessArg,
  };
}

function isNetworkFailure(reason: string | undefined): boolean {
  return (
    typeof reason === "string" && reason.startsWith("could not reach GitHub")
  );
}

function extractSkillVersion(files: Map<string, string>): string {
  const raw = files.get("skill.json");
  if (!raw) {
    return "0.0.0";
  }
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
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

export async function runImport(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch import: ${parsed.error} — nothing was changed.`);
    return 1;
  }
  const { skillName, targetPath, harnessArg } = parsed;

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

  // UC-3 step 4: resolve, per harness, which registry folder to fetch
  // (0001-harness-suffix-convention.md: prefer "<name>-<code>", else
  // "<name>", else unavailable), then fetch each distinct resolved folder
  // once.
  const resolvedFolders = new Map<string, string>();
  try {
    for (const harness of sortedHarnesses) {
      const folderName = await resolveSkillFolderName(
        skillName,
        harness,
        (name) => checkFolderExists(token as string, name),
      );
      if (!folderName) {
        console.error(
          `hatch import: "${skillName}" was not found in the registry for harness "${harness}" — nothing was changed.`,
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

  const distinctFolders = [...new Set(resolvedFolders.values())];
  const fetchResults = new Map<string, RegistryFetchOk>();
  for (const folderName of distinctFolders) {
    const result = await fetchRegistryFolder(token, folderName);
    if (!result.ok) {
      console.error(
        `hatch import: registry unreachable (${result.detail}) — nothing was changed.`,
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
  const primaryFolder = resolvedFolders.get(sortedHarnesses[0]) as string;
  const version = extractSkillVersion(
    (fetchResults.get(primaryFolder) as RegistryFetchOk).files,
  );

  const interactive = Boolean(process.stdin.isTTY);
  const conflictOutcomes: ConflictOutcome[] = [];
  const writtenFiles: string[] = [];

  try {
    // UC-3 steps 5-6: check each destination path and place content per
    // declared harness.
    for (const harness of sortedHarnesses) {
      const folderName = resolvedFolders.get(harness) as string;
      const fetchResult = fetchResults.get(folderName) as RegistryFetchOk;
      const definition = getHarnessDefinition(harness);
      const skillDestDir = join(targetPath, definition.skillsDir, skillName);

      for (const [relativePath, content] of fetchResult.files) {
        if (relativePath === "skill.json") {
          continue; // registry metadata, not part of the deployed skill content
        }
        let destFile = join(skillDestDir, relativePath);

        if (existsSync(destFile)) {
          const decision = await resolveDestinationConflict(
            destFile,
            interactive,
          );
          if (decision === "skip") {
            conflictOutcomes.push({ destFile, outcome: "skipped" });
            continue;
          }
          const finalPath = resolveAvailableSuffixedPath(destFile);
          conflictOutcomes.push({
            destFile,
            outcome: "suffixed",
            finalPath,
          });
          destFile = finalPath;
        }

        mkdirSync(dirname(destFile), { recursive: true });
        writeFileSync(destFile, content, "utf8");
        writtenFiles.push(destFile);
      }
    }

    // UC-3 step 7: write/update the manifest.
    const existingSkills =
      existingManifest &&
      typeof existingManifest.skills === "object" &&
      existingManifest.skills !== null
        ? (existingManifest.skills as Record<string, unknown>)
        : {};
    const manifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      skills: {
        ...existingSkills,
        [skillName]: { version },
      },
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    // UC-3 step 8: exactly one commit for the whole operation.
    await git.add(".");
    await git.commit(`hatch import: add "${skillName}"`);
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
      `hatch import: failed to import "${skillName}" (${message}) — nothing was changed.`,
    );
    return 1;
  }

  // UC-3 step 9: summary.
  console.log(
    `hatch import: added "${skillName}" (v${version}) to harness(es) ${sortedHarnesses.join(", ")}.`,
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
}
