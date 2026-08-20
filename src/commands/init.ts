// `hatch init`: makes an *existing* directory Hatch-managed — fetches the
// fixed "how to use Hatch" skill from the registry, places it into every
// declared harness folder, writes the manifest, and commits once when the
// project is version-controlled.
//
// It never creates the target directory and never initializes a git
// repository: creating a project is a separate concern that lives outside
// this CLI.
//
// Manifest creation belongs exclusively to this command
// (0015-import-harness-selection-flag.md): every other project-scoped
// command requires a manifest and names `hatch init` when none is present.
//
// Every abort path — unrecognized harness, missing target, authentication
// failure, registry unreachable, a failure partway through placement —
// leaves the directory exactly as it was found.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveToken, writeCredentials } from "../auth/credentials.js";
import { validateGitHubToken } from "../auth/github-token.js";
import { promptHidden } from "../cli/prompt.js";
import { getHarnessDefinition, isKnownHarness } from "../harness-registry.js";
import { migrateManifest } from "../manifest-migrations/index.js";
import { isTestProject } from "../project/test-project.js";
import { openVersionControl } from "../project/version-control.js";
import { fetchRegistryFolder } from "../registry/fetch.js";
import { isRegistryOnlyFile } from "../registry/registry-only-files.js";

const SELF_DOC_SKILL_NAME = "hatch-usage";

interface ParsedArgs {
  targetPath: string;
  harnesses: string[];
  // 0027-testing-skill-convention.md: marks the project as one that may
  // import testing content. Recorded in the convention's own record and in
  // its spec, and deliberately absent from the README and from this
  // command's output — ordinary projects have no reason to reach for it.
  testProject: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const positional: string[] = [];
  let targetPath = process.cwd();
  let harnessArg: string | undefined;
  let testProject = false;

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
    } else if (arg === "--test-project") {
      testProject = true;
    } else if (arg.startsWith("--")) {
      // Also how "skip the self-documentation skill" is refused: there is
      // no such flag, so any attempt at one lands here.
      return { error: `unrecognized option "${arg}"` };
    } else {
      positional.push(arg);
    }
  }

  // There is no project name to give — init adopts a directory that
  // already exists.
  if (positional.length > 0) {
    return { error: `unexpected extra argument "${positional[0]}"` };
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

  return { targetPath: resolve(targetPath), harnesses, testProject };
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

export async function runInit(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch init: ${parsed.error} — nothing was created.`);
    return 1;
  }
  const { targetPath, harnesses, testProject } = parsed;

  // Validated before anything else — in particular before authenticating,
  // so a typo'd harness never costs a credential prompt or a registry call.
  const unknownHarnesses = harnesses.filter((h) => !isKnownHarness(h));
  if (unknownHarnesses.length > 0) {
    console.error(
      `hatch init: unrecognized harness(es): ${unknownHarnesses.join(", ")} — nothing was created.`,
    );
    return 1;
  }

  // The target must already exist: init adopts a directory, it never makes
  // one.
  if (!existsSync(targetPath)) {
    console.error(
      `hatch init: target project "${targetPath}" does not exist — nothing was created.`,
    );
    return 1;
  }

  // Resolved at entry, before any mutation, so the "no version control, no
  // recovery point" warning reaches the developer even on a run that aborts
  // long before it would have committed.
  const vc = await openVersionControl("hatch init", targetPath);

  const manifestPath = join(targetPath, "hatch.manifest.json");
  if (existsSync(manifestPath)) {
    return reportAlreadyInitialized(manifestPath, harnesses, testProject);
  }

  const sortedHarnesses = [...harnesses].sort();

  // Authenticate before any filesystem change; reuse an existing session if
  // one already resolves rather than re-prompting.
  let token = resolveToken();
  if (!token) {
    const candidate = (
      await promptHidden("Registry personal access token: ")
    ).trim();
    if (!candidate) {
      console.error("hatch init: no token provided — nothing was created.");
      return 1;
    }

    const validation = await validateGitHubToken(candidate);
    if (!validation.valid) {
      if (isNetworkFailure(validation.reason)) {
        console.error(
          `hatch init: registry unreachable (${validation.reason}) — nothing was created.`,
        );
      } else {
        console.error(
          `hatch init: invalid password (${validation.reason}) — nothing was created.`,
        );
      }
      return 1;
    }

    writeCredentials(candidate);
    token = candidate;
  }

  // Resolved before creating anything on disk, so a fetch failure never
  // leaves a partial placement behind.
  const fetchResult = await fetchRegistryFolder(token, SELF_DOC_SKILL_NAME);
  if (!fetchResult.ok) {
    console.error(
      `hatch init: registry unreachable (${fetchResult.detail}) — nothing was created.`,
    );
    return 1;
  }

  // Rollback bookkeeping: `createdRoots` holds the topmost directory each
  // mkdir actually brought into existence, so undoing placement removes
  // exactly what this run added and never a directory that was already
  // there; `writtenFiles` covers files written into directories that
  // already existed.
  const createdRoots: string[] = [];
  const writtenFiles: string[] = [];

  const ensureDir = (dir: string): void => {
    const created = mkdirSync(dir, { recursive: true });
    if (created !== undefined) {
      createdRoots.push(created);
    }
  };

  try {
    // The self-documentation skill goes into every declared harness, always
    // — a project cannot be initialized without it.
    for (const harness of sortedHarnesses) {
      const definition = getHarnessDefinition(harness);
      const skillDestDir = join(
        targetPath,
        definition.skillsDir,
        SELF_DOC_SKILL_NAME,
      );
      for (const [relativePath, content] of fetchResult.files) {
        if (isRegistryOnlyFile(relativePath)) {
          continue; // registry metadata/authoring content, never deployed
        }
        const destFile = join(skillDestDir, relativePath);
        ensureDir(dirname(destFile));
        writeFileSync(destFile, content, "utf8");
        writtenFiles.push(destFile);
      }
    }

    const manifest = migrateManifest({
      schemaVersion: 1,
      harnesses: sortedHarnesses,
      // Recorded only when asked for, so an ordinary project's manifest is
      // byte-identical to what it was before this flag existed.
      ...(testProject ? { testProject: true } : {}),
      skills: {
        [SELF_DOC_SKILL_NAME]: {
          version: extractSkillVersion(fetchResult.files),
        },
      },
    });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    // One commit for the whole scaffold when the project is a repository
    // root; skipped entirely, without failing, when it isn't.
    await vc.commit("hatch init: initialize Hatch project scaffold");
  } catch (error) {
    for (const file of writtenFiles) {
      rmSync(file, { force: true });
    }
    for (const dir of createdRoots) {
      rmSync(dir, { recursive: true, force: true });
    }
    rmSync(manifestPath, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `hatch init: failed to initialize the project (${message}) — nothing was created.`,
    );
    return 1;
  }

  console.log(
    `hatch init: initialized "${targetPath}" with harness(es) ${sortedHarnesses.join(", ")}.`,
  );
  return 0;
}

// An existing manifest is never modified. Asking for exactly what the
// project already declares is an already-in-desired-state request and
// succeeds silently, matching how `--add-harness` and `remove --harness`
// treat theirs. Asking for a harness it does *not* declare is an explicit
// request that init cannot satisfy, so it fails rather than quietly doing
// nothing — harness addition has its own command.
function reportAlreadyInitialized(
  manifestPath: string,
  requested: string[],
  testProject: boolean,
): number {
  let declared: string[] = [];
  let alreadyTestProject = false;
  try {
    const manifest = migrateManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    const recorded = manifest.harnesses;
    if (
      Array.isArray(recorded) &&
      recorded.every((h) => typeof h === "string")
    ) {
      declared = recorded as string[];
    }
    alreadyTestProject = isTestProject(manifest);
  } catch {
    declared = [];
  }

  // An existing manifest is never modified, so `--test-project` cannot be
  // applied retroactively (0027-testing-skill-convention.md). Say so rather
  // than accepting the flag silently — the caller asked for something this
  // command will not do. Naming the flag here doesn't advertise it: the
  // caller has just typed it.
  if (testProject && !alreadyTestProject) {
    console.log(
      "hatch init: warning: --test-project had no effect — this project is already initialized and its manifest was left unchanged.",
    );
  }

  const undeclared = requested.filter((h) => !declared.includes(h));
  if (undeclared.length > 0) {
    console.error(
      `hatch init: this project is already initialized — harness(es) ${undeclared.join(", ")} are not declared; add them with \`hatch import --add-harness <name>\` — nothing was changed.`,
    );
    return 1;
  }

  console.log(
    `hatch init: this project is already initialized with harness(es) ${[...declared].sort().join(", ")} — nothing to do.`,
  );
  return 0;
}
