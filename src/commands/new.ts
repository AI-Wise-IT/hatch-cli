// `hatch new` (UC-1): bootstraps a brand-new Hatch-managed project — creates
// the target folder, initializes git, fetches the fixed "how to use Hatch"
// skill from the registry, places it into every declared harness folder,
// writes the manifest, and makes one commit. All 5 AFs (invalid password,
// target path occupied, invalid harness selection, target location not
// writable, registry unreachable) abort before anything persists.

import {
  constants,
  accessSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { simpleGit } from "simple-git";
import { resolveToken, writeCredentials } from "../auth/credentials.js";
import { validateGitHubToken } from "../auth/github-token.js";
import { promptHidden } from "../cli/prompt.js";
import { getHarnessDefinition, isKnownHarness } from "../harness-registry.js";
import { migrateManifest } from "../manifest-migrations/index.js";
import { fetchRegistryFolder } from "../registry/fetch.js";

const SELF_DOC_SKILL_NAME = "hatch-usage";

interface ParsedArgs {
  name: string;
  parentDir: string;
  harnesses: string[];
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const positional: string[] = [];
  let parentDir = process.cwd();
  let harnessArg: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--path requires a value" };
      }
      parentDir = value;
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
    return { error: "a project folder name is required" };
  }
  if (positional.length > 1) {
    return { error: `unexpected extra argument "${positional[1]}"` };
  }
  if (!harnessArg) {
    return { error: "--harness <name[,name...]> is required" };
  }

  const harnesses = harnessArg
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (harnesses.length === 0) {
    return { error: "--harness <name[,name...]> is required" };
  }

  return { name: positional[0], parentDir: resolve(parentDir), harnesses };
}

function isWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
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

export async function runNew(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch new: ${parsed.error} — nothing was created.`);
    return 1;
  }
  const { name, parentDir, harnesses } = parsed;

  // AF-3: invalid/unrecognized harness selection — validated before
  // anything else is created or even authenticated.
  const unknownHarnesses = harnesses.filter((h) => !isKnownHarness(h));
  if (unknownHarnesses.length > 0) {
    console.error(
      `hatch new: unrecognized harness(es): ${unknownHarnesses.join(", ")} — nothing was created.`,
    );
    return 1;
  }

  // Main flow step 2 / AF-1 / AF-5: authenticate before any filesystem
  // change. Reuse an existing session if one already resolves — don't
  // re-prompt (UC-2's postcondition).
  let token = resolveToken();
  if (!token) {
    const candidate = (
      await promptHidden("Registry personal access token: ")
    ).trim();
    if (!candidate) {
      console.error("hatch new: no token provided — nothing was created.");
      return 1;
    }

    const validation = await validateGitHubToken(candidate);
    if (!validation.valid) {
      if (isNetworkFailure(validation.reason)) {
        console.error(
          `hatch new: registry unreachable (${validation.reason}) — nothing was created.`,
        );
      } else {
        console.error(
          `hatch new: invalid password (${validation.reason}) — nothing was created.`,
        );
      }
      return 1;
    }

    writeCredentials(candidate);
    token = candidate;
  }

  const targetPath = join(parentDir, name);

  // AF-4: target location not writable.
  if (!existsSync(parentDir)) {
    console.error(
      `hatch new: target location "${parentDir}" does not exist — nothing was created.`,
    );
    return 1;
  }
  if (!isWritable(parentDir)) {
    console.error(
      `hatch new: target location "${parentDir}" is not writable — nothing was created.`,
    );
    return 1;
  }

  // AF-2: target path already occupied.
  if (existsSync(targetPath)) {
    console.error(
      `hatch new: "${targetPath}" already exists — nothing was created.`,
    );
    return 1;
  }

  // AF-5 (registry unreachable, fetch side): resolved before creating
  // anything on disk, so a fetch failure never leaves a partial folder or
  // git repo behind.
  const fetchResult = await fetchRegistryFolder(token, SELF_DOC_SKILL_NAME);
  if (!fetchResult.ok) {
    console.error(
      `hatch new: registry unreachable (${fetchResult.detail}) — nothing was created.`,
    );
    return 1;
  }

  try {
    mkdirSync(targetPath, { recursive: true });

    const git = simpleGit(targetPath);
    await git.init();

    const sortedHarnesses = [...harnesses].sort();
    for (const harness of sortedHarnesses) {
      const definition = getHarnessDefinition(harness);
      const skillDestDir = join(
        targetPath,
        definition.skillsDir,
        SELF_DOC_SKILL_NAME,
      );
      for (const [relativePath, content] of fetchResult.files) {
        if (relativePath === "skill.json") {
          continue; // registry metadata, not part of the deployed skill content
        }
        const destFile = join(skillDestDir, relativePath);
        mkdirSync(dirname(destFile), { recursive: true });
        writeFileSync(destFile, content, "utf8");
      }
    }

    const manifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      skills: {
        [SELF_DOC_SKILL_NAME]: {
          version: extractSkillVersion(fetchResult.files),
        },
      },
    });
    writeFileSync(
      join(targetPath, "hatch.manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    await git.add(".");
    await git.commit("hatch new: bootstrap project scaffold");
  } catch (error) {
    rmSync(targetPath, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch new: failed to bootstrap the project (${message}) — nothing was created.`,
    );
    return 1;
  }

  console.log(
    `hatch new: created "${targetPath}" with harness(es) ${sortedHarnessesLabel(harnesses)}.`,
  );
  return 0;
}

function sortedHarnessesLabel(harnesses: string[]): string {
  return [...harnesses].sort().join(", ");
}
