import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashEntries } from "../manifest-migrations/content-hash.js";

vi.mock("../auth/credentials.js", () => ({
  resolveToken: vi.fn(),
  writeCredentials: vi.fn(),
}));
vi.mock("../auth/github-token.js", () => ({
  validateGitHubToken: vi.fn(),
}));
vi.mock("../cli/prompt.js", () => ({
  promptHidden: vi.fn(),
  promptLine: vi.fn(),
}));
vi.mock("../registry/fetch.js", () => ({
  fetchRegistryFile: vi.fn(),
  fetchRegistryFolder: vi.fn(),
  fetchPublishedVersions: vi.fn(),
  registryFolderExists: vi.fn(),
}));
// Wraps the real simpleGit so tests exercise real git plumbing by default;
// only the rollback test overrides it to simulate a mid-operation failure.
vi.mock("simple-git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("simple-git")>();
  return { ...actual, simpleGit: vi.fn(actual.simpleGit) };
});

const { resolveToken, writeCredentials } = await import(
  "../auth/credentials.js"
);
const { validateGitHubToken } = await import("../auth/github-token.js");
const { promptHidden, promptLine } = await import("../cli/prompt.js");
const {
  fetchRegistryFile,
  fetchRegistryFolder,
  registryFolderExists,
  fetchPublishedVersions,
} = await import("../registry/fetch.js");
const { simpleGit } = await import("simple-git");
const { runImport } = await import("./import.js");

let tempParent: string;
let target: string;
let consoleErrors: string[];
let consoleLogs: string[];
let seededManifestRaw: string;

function skillFiles(version = "1.0.0"): Map<string, string> {
  return new Map([
    ["SKILL.md", "# Example Skill"],
    ["skill.json", `{"version":"${version}"}`],
  ]);
}

function setStdinTTY(value: boolean) {
  Object.defineProperty(process.stdin, "isTTY", {
    value,
    configurable: true,
    writable: true,
  });
}

// The manifest `hatch init` would have written. Every import runs against a
// project that already has one — import never creates it.
function seedManifest(
  harnesses: string[],
  skills: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  seededManifestRaw = `${JSON.stringify({ schemaVersion: 3, harnesses, ...extra, skills }, null, 2)}\n`;
  writeFileSync(join(target, "hatch.manifest.json"), seededManifestRaw, "utf8");
}

// The "nothing was changed" half of an abort assertion: byte-for-byte, not
// merely structurally, identical to what the project started with.
function expectManifestUnchanged() {
  expect(readFileSync(join(target, "hatch.manifest.json"), "utf8")).toBe(
    seededManifestRaw,
  );
}

// `git log` errors on a repository with no commits yet, so an assertion
// that nothing was committed counts revisions instead.
async function commitCount(dir: string): Promise<number> {
  const out = await simpleGit(dir).raw(["rev-list", "--count", "--all"]);
  return Number(out.trim());
}

// biome-ignore lint/suspicious/noExplicitAny: assertions read ad-hoc manifest fields
function readManifest(): Record<string, any> {
  return JSON.parse(readFileSync(join(target, "hatch.manifest.json"), "utf8"));
}

beforeEach(async () => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-import-test-"));
  target = join(tempParent, "myproj");
  mkdirSync(target, { recursive: true });

  consoleErrors = [];
  consoleLogs = [];
  vi.spyOn(console, "error").mockImplementation((msg: string) => {
    consoleErrors.push(msg);
  });
  vi.spyOn(console, "log").mockImplementation((msg: string) => {
    consoleLogs.push(msg);
  });

  process.env.GIT_AUTHOR_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = "test@example.com";
  process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_COMMITTER_EMAIL = "test@example.com";

  setStdinTTY(false);

  vi.mocked(resolveToken).mockReset().mockReturnValue("existing-session-token");
  vi.mocked(writeCredentials).mockReset();
  vi.mocked(validateGitHubToken).mockReset();
  vi.mocked(promptHidden).mockReset();
  vi.mocked(promptLine).mockReset();
  vi.mocked(registryFolderExists)
    .mockReset()
    .mockImplementation(async (_token, name) => ({
      ok: true,
      exists: name === "example-skill",
    }));
  vi.mocked(fetchPublishedVersions).mockReset();
  vi.mocked(fetchRegistryFolder).mockReset().mockResolvedValue({
    ok: true,
    files: skillFiles(),
  });
  // Default: the classification lookup (does <name>/skill.json exist and
  // does it have "members"?) finds nothing, so every existing standalone
  // test's target is treated as a plain skill, same as before groups
  // existed.
  vi.mocked(fetchRegistryFile).mockReset().mockResolvedValue({
    ok: false,
    reason: "not-found",
    detail: "not found",
  });

  await simpleGit(target).init();
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempParent, { recursive: true, force: true });
});

describe("runImport — main flow", () => {
  it("places the skill per harness, writes the manifest, and commits once", async () => {
    seedManifest(["claude", "codex"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Example Skill");
    expect(
      readFileSync(
        join(target, ".agents", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Example Skill");
    // Both declared harnesses carry byte-identical content.
    expect(
      readFileSync(
        join(target, ".agents", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    );
    // codex's directory is `.agents/skills`; the one it used to occupy is
    // never written to.
    expect(existsSync(join(target, ".codex"))).toBe(false);

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest).toEqual({
      schemaVersion: 4,
      harnesses: ["claude", "codex"],
      skills: {
        "example-skill": { version: "1.0.0", contentHash: expect.any(String) },
      },
    });

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
  });

  it("places into exactly the harnesses the manifest records, never the filesystem's", async () => {
    writeFileSync(
      join(target, "hatch.manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        harnesses: ["claude"],
        skills: {},
      }),
      "utf8",
    );
    // A stray harness folder on disk must not widen placement.
    mkdirSync(join(target, ".agents", "skills"), { recursive: true });

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, ".agents", "skills", "example-skill"))).toBe(
      false,
    );
    // The undeclared harness's directory is left exactly as it was found.
    expect(existsSync(join(target, ".agents", "skills"))).toBe(true);
    expect(readdirSync(join(target, ".agents", "skills"))).toEqual([]);
  });

  it("resolves the harness-suffixed variant over the plain default, deploying under the plain name", async () => {
    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "example-skill-cld" || name === "example-skill",
      }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "example-skill-cld") {
          return {
            ok: true,
            files: new Map([
              ["SKILL.md", "# Claude variant"],
              ["skill.json", '{"version":"2.0.0"}'],
            ]),
          };
        }
        return { ok: true, files: skillFiles() };
      },
    );

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "existing-session-token",
      "example-skill-cld",
      undefined,
    );
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Claude variant");
  });

  // A harness's reserved code and its directory are independent (ADR-0033):
  // codex still resolves the `-cdx` sibling, and still deploys it under the
  // plain name — only the directory it lands in moved.
  it("deploys a -cdx registry variant under its plain name in the codex harness's directory", async () => {
    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "example-skill-cdx" || name === "example-skill",
      }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "example-skill-cdx") {
          return {
            ok: true,
            files: new Map([
              ["SKILL.md", "# Codex variant"],
              ["skill.json", '{"version":"2.0.0"}'],
            ]),
          };
        }
        return { ok: true, files: skillFiles() };
      },
    );

    seedManifest(["codex"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "existing-session-token",
      "example-skill-cdx",
      undefined,
    );
    // Suffix stripped at deploy time, under the harness's current directory.
    expect(
      readFileSync(
        join(target, ".agents", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Codex variant");
    expect(
      existsSync(join(target, ".agents", "skills", "example-skill-cdx")),
    ).toBe(false);
    expect(existsSync(join(target, ".codex"))).toBe(false);
  });
});

describe("runImport — version control is optional", () => {
  // The shared fixture is a repository root; these tests take that away.
  function makeNonGit() {
    rmSync(join(target, ".git"), { recursive: true, force: true });
  }

  it("creates no repository, and still places the content and updates the manifest", async () => {
    makeNonGit();
    seedManifest(["claude"]);

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".git"))).toBe(false);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Example Skill");
    expect(readManifest().skills["example-skill"].version).toBe("1.0.0");
  });

  it("attempts no commit at all when the project is not a repository", async () => {
    makeNonGit();
    seedManifest(["claude"]);
    const commit = vi.fn();
    vi.mocked(simpleGit).mockImplementationOnce(
      () =>
        ({
          checkIsRepo: vi.fn().mockResolvedValue(false),
          add: vi.fn(),
          commit,
          // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
        }) as any,
    );

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it("warns on every invocation, without changing a successful run's exit code", async () => {
    makeNonGit();
    mockStandaloneSkill(() => "1.0.0");
    seedManifest(["claude"]);

    const first = await runImport(["example-skill", "--path", target]);
    const firstWarnings = consoleLogs.filter((m) =>
      m.includes("not a git repository"),
    ).length;
    const second = await runImport(["example-skill", "--path", target]);
    const totalWarnings = consoleLogs.filter((m) =>
      m.includes("not a git repository"),
    ).length;

    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(firstWarnings).toBe(1);
    expect(totalWarnings).toBe(2);
  });

  it("warns at command entry, on a run that aborts before it would ever commit", async () => {
    makeNonGit();
    // No manifest at all: the run aborts at the precondition check, long
    // before any commit could have happened.
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      true,
    );
  });

  it("stays silent about version control in a repository root", async () => {
    seedManifest(["claude"]);

    await runImport(["example-skill", "--path", target]);

    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      false,
    );
  });
});

describe("runImport — a manifest is a precondition (0015-import-harness-selection-flag)", () => {
  it("fails naming `hatch init` when the project has no manifest, changing and fetching nothing", async () => {
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) =>
          m.includes("no hatch.manifest.json found") &&
          m.includes("hatch init"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(target, ".claude"))).toBe(false);
    expect(resolveToken).not.toHaveBeenCalled();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("rejects --harness as an unrecognized argument", async () => {
    const exitCode = await runImport([
      "example-skill",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("unrecognized option") && m.includes("--harness"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(target, ".claude"))).toBe(false);
    expect(resolveToken).not.toHaveBeenCalled();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("rejects --harness even against an already-initialized project", async () => {
    seedManifest(["claude"]);

    const exitCode = await runImport([
      "example-skill",
      "--path",
      target,
      "--harness",
      "codex",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("unrecognized option") && m.includes("--harness"),
      ),
    ).toBe(true);
    expect(readManifest().harnesses).toEqual(["claude"]);
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("refuses a manifest that records no valid harnesses", async () => {
    writeFileSync(
      join(target, "hatch.manifest.json"),
      JSON.stringify({ schemaVersion: 3, harnesses: [], skills: {} }),
      "utf8",
    );

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("no valid harnesses recorded")),
    ).toBe(true);
  });
});

describe("runImport — skill not found for a declared harness", () => {
  it("aborts cleanly when neither suffixed nor plain variant exists for a harness", async () => {
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: false,
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["nonexistent-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("was not found in the registry")),
    ).toBe(true);
    expectManifestUnchanged();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });
});

describe("runImport — AF-6: destination occupied", () => {
  function preOccupyDestination() {
    const destDir = join(target, ".claude", "skills", "example-skill");
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "SKILL.md"), "not placed by hatch", "utf8");
  }

  it("defaults to skipping the conflicting file when unattended, and still completes", async () => {
    preOccupyDestination();
    setStdinTTY(false);

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(promptLine).not.toHaveBeenCalled();
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("not placed by hatch");
    expect(consoleLogs.some((m) => m.includes("skipped"))).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(true);
  });

  it("skips the conflicting file interactively when the developer chooses skip", async () => {
    preOccupyDestination();
    setStdinTTY(true);
    vi.mocked(promptLine).mockResolvedValue("skip");

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(promptLine).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("not placed by hatch");
  });

  it("places the content alongside with a suffix interactively when the developer chooses suffix", async () => {
    preOccupyDestination();
    setStdinTTY(true);
    vi.mocked(promptLine).mockResolvedValue("suffix");

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("not placed by hatch");
    expect(
      readFileSync(
        join(
          target,
          ".claude",
          "skills",
          "example-skill",
          "SKILL.hatch-import.md",
        ),
        "utf8",
      ),
    ).toBe("# Example Skill");
    expect(consoleLogs.some((m) => m.includes("SKILL.hatch-import.md"))).toBe(
      true,
    );
  });
});

describe("runImport — AF-7: registry unreachable", () => {
  it("aborts when checking harness-folder existence can't reach the registry", async () => {
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expectManifestUnchanged();
  });

  it("aborts when the fetch step can't reach the registry", async () => {
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expectManifestUnchanged();
  });

  it("aborts when authentication itself can't reach the registry", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("some-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "could not reach GitHub (network down)",
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expectManifestUnchanged();
    expect(writeCredentials).not.toHaveBeenCalled();
  });
});

describe("runImport — AF-8: invalid password", () => {
  it("aborts before fetching or placing anything when the token is rejected", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("bad-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "GitHub rejected the token as invalid or expired",
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("invalid password"))).toBe(
      true,
    );
    expectManifestUnchanged();
    expect(writeCredentials).not.toHaveBeenCalled();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });
});

describe("runImport — rollback on partial failure", () => {
  it("removes placed files and restores the manifest if the commit fails, leaving the project directory intact", async () => {
    vi.mocked(simpleGit).mockImplementationOnce(
      () =>
        ({
          checkIsRepo: vi.fn().mockResolvedValue(true),
          add: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockRejectedValue(new Error("simulated git failure")),
          // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
        }) as any,
    );

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(existsSync(target)).toBe(true);
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
      ),
    ).toBe(false);
    expectManifestUnchanged();
  });

  it("removes placed files and restores the manifest when placement fails in a non-git project", async () => {
    seedManifest(["claude", "codex"]);
    rmSync(join(target, ".git"), { recursive: true, force: true });
    // Placement runs alphabetically. A *file* where codex's skill directory
    // has to be created breaks the second harness's placement outright —
    // this is not a destination-file conflict, so AF-6's skip/suffix
    // handling never sees it.
    mkdirSync(join(target, ".agents", "skills"), { recursive: true });
    writeFileSync(
      join(target, ".agents", "skills", "example-skill"),
      "not a directory",
      "utf8",
    );

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    // Every file the command wrote is gone...
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
      ),
    ).toBe(false);
    // ...the manifest is byte-identical...
    expectManifestUnchanged();
    // ...and no repository was conjured up to recover with.
    expect(existsSync(join(target, ".git"))).toBe(false);
  });
});

// Group-json helper matching 0016-group-member-manifest-format.md's shape.
function groupSkillJson(version: string, members: unknown[]): string {
  return JSON.stringify({ version, members });
}
function plainSkillJson(version: string): string {
  return JSON.stringify({ version });
}

describe("runImport — group import (0013, 0016)", () => {
  it("imports a group with only nested members as flat, individual entries under each declared harness, one commit", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("1.0.0", [
            { kind: "nested", name: "a" },
            { kind: "nested", name: "b" },
          ]),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "my-group") {
        return {
          ok: true,
          files: new Map([
            [
              "skill.json",
              groupSkillJson("1.0.0", [
                { kind: "nested", name: "a" },
                { kind: "nested", name: "b" },
              ]),
            ],
            ["a/SKILL.md", "# A"],
            ["b/SKILL.md", "# B"],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(join(target, ".claude", "skills", "a", "SKILL.md"), "utf8"),
    ).toBe("# A");
    expect(
      readFileSync(join(target, ".claude", "skills", "b", "SKILL.md"), "utf8"),
    ).toBe("# B");

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest).toEqual({
      schemaVersion: 4,
      harnesses: ["claude"],
      skills: {
        a: {
          version: "1.0.0",
          group: "my-group",
          contentHash: expect.any(String),
        },
        b: {
          version: "1.0.0",
          group: "my-group",
          contentHash: expect.any(String),
        },
        "my-group": { version: "1.0.0" },
      },
    });

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
  });

  it("imports a group with a pointer to a standalone skill and a pointer to another group, flattening with no duplicate placement", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "combo-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("1.0.0", [
            { kind: "pointer", name: "example-pointer-skill" },
            { kind: "pointer", name: "sub-group" },
          ]),
        };
      }
      if (path === "example-pointer-skill/skill.json") {
        return { ok: true, content: plainSkillJson("3.0.0") };
      }
      if (path === "sub-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("2.0.0", [
            { kind: "nested", name: "inner-skill" },
          ]),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "combo-group") {
        return {
          ok: true,
          files: new Map([
            [
              "skill.json",
              groupSkillJson("1.0.0", [
                { kind: "pointer", name: "example-pointer-skill" },
                { kind: "pointer", name: "sub-group" },
              ]),
            ],
          ]),
        };
      }
      if (name === "example-pointer-skill") {
        return {
          ok: true,
          files: new Map([
            ["skill.json", plainSkillJson("3.0.0")],
            ["SKILL.md", "# PRD"],
          ]),
        };
      }
      if (name === "sub-group") {
        return {
          ok: true,
          files: new Map([
            [
              "skill.json",
              groupSkillJson("2.0.0", [
                { kind: "nested", name: "inner-skill" },
              ]),
            ],
            ["inner-skill/SKILL.md", "# Inner"],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["combo-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "example-pointer-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# PRD");
    expect(
      readFileSync(
        join(target, ".claude", "skills", "inner-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Inner");
    // Flattened, never a nested "sub-group" folder.
    expect(existsSync(join(target, ".claude", "skills", "sub-group"))).toBe(
      false,
    );

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills).toEqual({
      "example-pointer-skill": {
        version: "3.0.0",
        group: "combo-group",
        contentHash: expect.any(String),
      },
      "inner-skill": {
        version: "2.0.0",
        group: "combo-group",
        contentHash: expect.any(String),
      },
      "combo-group": { version: "1.0.0" },
    });
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "existing-session-token",
      "example-pointer-skill",
      undefined,
    );
  });
});

describe("runImport — AF-9: pinned-pointer version conflict within a group", () => {
  it("resolves a same-MAJOR conflict to the highest pinned version, warns naming both, and completes", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "conflict-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("1.0.0", [
            { kind: "pointer", name: "shared", version: "1.2.0" },
            { kind: "pointer", name: "shared", version: "1.5.0" },
          ]),
        };
      }
      if (path === "shared/skill.json") {
        return { ok: true, content: plainSkillJson("1.2.0") };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, name, ref) => {
        if (name === "conflict-group") {
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                groupSkillJson("1.0.0", [
                  { kind: "pointer", name: "shared", version: "1.2.0" },
                  { kind: "pointer", name: "shared", version: "1.5.0" },
                ]),
              ],
            ]),
          };
        }
        if (name === "shared") {
          expect(ref).toBe("shared@1.5.0"); // only the winning pin is ever fetched
          return {
            ok: true,
            files: new Map([
              ["skill.json", plainSkillJson("1.5.0")],
              ["SKILL.md", "# shared v1.5"],
            ]),
          };
        }
        throw new Error(`unexpected fetch of ${name}`);
      },
    );

    seedManifest(["claude"]);
    const exitCode = await runImport(["conflict-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "shared", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# shared v1.5");
    expect(
      consoleLogs.some((m) => m.includes("1.2.0") && m.includes("1.5.0")),
    ).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills.shared).toEqual({
      version: "1.5.0",
      group: "conflict-group",
      contentHash: expect.any(String),
    });
  });

  it("aborts the whole import on a cross-MAJOR conflict — nothing placed, no manifest change, no commit", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "abort-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("1.0.0", [
            { kind: "pointer", name: "shared", version: "1.9.0" },
            { kind: "pointer", name: "shared", version: "2.0.0" },
          ]),
        };
      }
      if (path === "shared/skill.json") {
        return { ok: true, content: plainSkillJson("1.9.0") };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "abort-group") {
        return {
          ok: true,
          files: new Map([
            [
              "skill.json",
              groupSkillJson("1.0.0", [
                { kind: "pointer", name: "shared", version: "1.9.0" },
                { kind: "pointer", name: "shared", version: "2.0.0" },
              ]),
            ],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["abort-group", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) =>
          m.includes("shared") && m.includes("1.9.0") && m.includes("2.0.0"),
      ),
    ).toBe(true);
    expectManifestUnchanged();
    expect(existsSync(join(target, ".claude", "skills", "shared"))).toBe(false);
  });
});

// Batch 7: re-import & staleness (AF-1..AF-4) + standalone version pinning
// (AF-10..AF-12, rescope-0001-standalone-version-pinning.md).

function mockStandaloneSkill(getVersion: () => string) {
  vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
    if (path === "example-skill/skill.json") {
      return { ok: true, content: plainSkillJson(getVersion()) };
    }
    return { ok: false, reason: "not-found", detail: "not found" };
  });
  vi.mocked(fetchRegistryFolder).mockImplementation(async () => ({
    ok: true,
    files: skillFiles(getVersion()),
  }));
}

describe("runImport — AF-1: re-import already up to date", () => {
  it("reports up to date, no changes, no commit", async () => {
    mockStandaloneSkill(() => "1.0.0");
    seedManifest(["claude"]);
    await runImport(["example-skill", "--path", target]);
    const manifestBefore = readFileSync(
      join(target, "hatch.manifest.json"),
      "utf8",
    );
    const logBefore = await simpleGit(target).log();

    consoleLogs.length = 0;
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("already up to date"))).toBe(
      true,
    );
    expect(readFileSync(join(target, "hatch.manifest.json"), "utf8")).toBe(
      manifestBefore,
    );
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total);
  });
});

describe("runImport — AF-2: re-import, update available, no local edits", () => {
  it("fetches and places the newer compatible version, updates the manifest, and commits with a version-bump message", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);
    seedManifest(["claude"]);
    await runImport(["example-skill", "--path", target]);
    const logBefore = await simpleGit(target).log();

    version = "1.1.0";
    consoleLogs.length = 0;
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("v1.0.0 → v1.1.0"))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].version).toBe("1.1.0");
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total + 1);
  });
});

describe("runImport — AF-3: re-import, local edits present", () => {
  it("leaves locally-edited content untouched and reports local edits, even with a newer version available", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);
    seedManifest(["claude"]);
    await runImport(["example-skill", "--path", target]);
    const skillFile = join(
      target,
      ".claude",
      "skills",
      "example-skill",
      "SKILL.md",
    );
    writeFileSync(skillFile, "edited locally by the developer", "utf8");
    const logBefore = await simpleGit(target).log();

    version = "1.1.0";
    consoleLogs.length = 0;
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("local edits"))).toBe(true);
    expect(readFileSync(skillFile, "utf8")).toBe(
      "edited locally by the developer",
    );
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].version).toBe("1.0.0");
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total);
  });
});

describe("runImport — AF-4: deprecated/removed skill detected", () => {
  it("surfaces a removed-flag warning for a previously-imported skill without blocking this run's primary operation", async () => {
    mockStandaloneSkill(() => "1.0.0");
    seedManifest(["claude"]);
    await runImport(["example-skill", "--path", target]);

    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, folderName) => ({
        ok: true,
        exists: folderName === "example-skill" || folderName === "other-skill",
      }),
    );
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "example-skill/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", removed: true }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "other-skill") {
          return { ok: true, files: skillFiles("1.0.0") };
        }
        throw new Error(`unexpected fetch of ${folderName}`);
      },
    );

    consoleLogs.length = 0;
    const exitCode = await runImport(["other-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      consoleLogs.some(
        (m) => m.includes("example-skill") && m.includes("removed"),
      ),
    ).toBe(true);
    expect(
      existsSync(join(target, ".claude", "skills", "other-skill", "SKILL.md")),
    ).toBe(true);
  });
});

describe("runImport — AF-10/AF-11/AF-12: standalone version pinning", () => {
  it("AF-11: fetches exactly the pinned version regardless of what's newer, and records the pin", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(
      async (_token, path, ref) => {
        if (path === "example-skill/skill.json") {
          return {
            ok: true,
            content: plainSkillJson(
              ref === "example-skill@1.0.0" ? "1.0.0" : "2.0.0",
            ),
          };
        }
        return { ok: false, reason: "not-found", detail: "not found" };
      },
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, _folderName, ref) => {
        expect(ref).toBe("example-skill@1.0.0");
        return { ok: true, files: skillFiles("1.0.0") };
      },
    );

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill@1.0.0", "--path", target]);

    expect(exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"]).toEqual({
      version: "1.0.0",
      contentHash: expect.any(String),
      pin: { type: "exact", value: "1.0.0" },
    });
  });

  it("AF-10: a bare re-import of a standing exact pin skips the update check entirely and leaves it untouched", async () => {
    mockStandaloneSkill(() => "1.0.0");
    seedManifest(["claude"]);
    await runImport(["example-skill@1.0.0", "--path", target]);
    const manifestBefore = readFileSync(
      join(target, "hatch.manifest.json"),
      "utf8",
    );
    const logBefore = await simpleGit(target).log();

    vi.mocked(fetchRegistryFolder).mockClear();
    consoleLogs.length = 0;
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      consoleLogs.some((m) => m.includes("pinned") && m.includes("1.0.0")),
    ).toBe(true);
    expect(readFileSync(join(target, "hatch.manifest.json"), "utf8")).toBe(
      manifestBefore,
    );
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total);
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("AF-12: records a range pin for visibility, but a later bare re-import still auto-updates normally", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);

    seedManifest(["claude"]);
    let exitCode = await runImport(["example-skill@^1.0.0", "--path", target]);
    expect(exitCode).toBe(0);
    let manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].pin).toEqual({
      type: "range",
      value: "1.0.0",
    });

    version = "1.1.0";
    consoleLogs.length = 0;
    exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("v1.0.0 → v1.1.0"))).toBe(true);
    manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].version).toBe("1.1.0");
    expect(manifest.skills["example-skill"].pin).toEqual({
      type: "range",
      value: "1.0.0",
    });
  });

  it("clears a standing exact pin via @latest, and a later bare re-import keeps auto-updating", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);

    seedManifest(["claude"]);
    await runImport(["example-skill@1.0.0", "--path", target]);

    version = "1.1.0";
    let exitCode = await runImport(["example-skill@latest", "--path", target]);
    expect(exitCode).toBe(0);
    let manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].pin).toBeUndefined();
    expect(manifest.skills["example-skill"].version).toBe("1.1.0");

    version = "1.2.0";
    exitCode = await runImport(["example-skill", "--path", target]);
    expect(exitCode).toBe(0);
    manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].version).toBe("1.2.0");
  });
});

describe("runImport — Batch 7: group re-import", () => {
  it("re-resolves the member graph on a group version bump and updates members, one commit", async () => {
    let groupVersion = "1.0.0";
    let memberVersion = "1.0.0";
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson(groupVersion, [
            { kind: "nested", name: "a" },
          ]),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "my-group") {
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                groupSkillJson(groupVersion, [{ kind: "nested", name: "a" }]),
              ],
              ["a/SKILL.md", `# A v${memberVersion}`],
            ]),
          };
        }
        throw new Error(`unexpected fetch of ${folderName}`);
      },
    );

    seedManifest(["claude"]);
    await runImport(["my-group", "--path", target]);
    const logBefore = await simpleGit(target).log();

    groupVersion = "1.1.0";
    memberVersion = "1.1.0";
    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(join(target, ".claude", "skills", "a", "SKILL.md"), "utf8"),
    ).toBe("# A v1.1.0");
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["my-group"].version).toBe("1.1.0");
    expect(manifest.skills.a.version).toBe("1.1.0");
    expect(manifest.skills.a.contentHash).toEqual(expect.any(String));
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total + 1);
  });

  it("skips a locally-edited member while still updating the group's own recorded version and other members", async () => {
    let groupVersion = "1.0.0";
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson(groupVersion, [
            { kind: "nested", name: "a" },
            { kind: "nested", name: "b" },
          ]),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "my-group") {
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                groupSkillJson(groupVersion, [
                  { kind: "nested", name: "a" },
                  { kind: "nested", name: "b" },
                ]),
              ],
              ["a/SKILL.md", `# A ${groupVersion}`],
              ["b/SKILL.md", `# B ${groupVersion}`],
            ]),
          };
        }
        throw new Error(`unexpected fetch of ${folderName}`);
      },
    );

    seedManifest(["claude"]);
    await runImport(["my-group", "--path", target]);
    writeFileSync(
      join(target, ".claude", "skills", "a", "SKILL.md"),
      "edited locally",
      "utf8",
    );

    groupVersion = "1.1.0";
    consoleLogs.length = 0;
    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(join(target, ".claude", "skills", "a", "SKILL.md"), "utf8"),
    ).toBe("edited locally");
    expect(
      readFileSync(join(target, ".claude", "skills", "b", "SKILL.md"), "utf8"),
    ).toBe("# B 1.1.0");
    expect(
      consoleLogs.some((m) => m.includes("a") && m.includes("local edits")),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["my-group"].version).toBe("1.1.0");
    expect(manifest.skills.a.version).toBe("1.0.0"); // untouched
    expect(manifest.skills.b.version).toBe("1.1.0"); // updated
  });
});

// Post-Batch-7 review findings (0021-block-first-time-import-of-removed-target).

describe("runImport — registry-only files are never deployed", () => {
  it("does not place a NOTE.md (or skill.json) found in the fetched content", async () => {
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["SKILL.md", "# Example Skill"],
        ["skill.json", '{"version":"1.0.0"}'],
        ["NOTE.md", "fixture authoring notes, never deployed"],
      ]),
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      existsSync(join(target, ".claude", "skills", "example-skill", "NOTE.md")),
    ).toBe(false);
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "skill.json"),
      ),
    ).toBe(false);
  });
});

describe("runImport — AF-13: first-time import of a removed target is blocked", () => {
  it("refuses a first-time import of a removed standalone skill — nothing changed", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "gone-skill/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", removed: true }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["gone-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("gone-skill") && m.includes("removed"),
      ),
    ).toBe(true);
    expectManifestUnchanged();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("refuses a first-time import of a removed group", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "gone-group/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({
            version: "1.0.0",
            removed: true,
            members: [{ kind: "nested", name: "a" }],
          }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });

    seedManifest(["claude"]);
    const exitCode = await runImport(["gone-group", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("gone-group") && m.includes("removed"),
      ),
    ).toBe(true);
    expectManifestUnchanged();
  });

  it("does not block a re-import of something already in the manifest that later became removed (AF-4 still applies, warn-only)", async () => {
    let removed = false;
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "example-skill/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", removed }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });

    seedManifest(["claude"]);
    let exitCode = await runImport(["example-skill", "--path", target]);
    expect(exitCode).toBe(0);

    removed = true;
    consoleLogs.length = 0;
    exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0); // AF-1/AF-4, not AF-13 — already imported
    expect(
      existsSync(
        join(target, ".claude", "skills", "example-skill", "SKILL.md"),
      ),
    ).toBe(true);
  });

  it("does not block a group whose own entry is fine but a member is removed (unchanged, warn-only)", async () => {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "fine-group/skill.json") {
        return {
          ok: true,
          content: groupSkillJson("1.0.0", [
            { kind: "pointer", name: "removed-member" },
          ]),
        };
      }
      if (path === "removed-member/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", removed: true }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "fine-group") {
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                groupSkillJson("1.0.0", [
                  { kind: "pointer", name: "removed-member" },
                ]),
              ],
            ]),
          };
        }
        if (folderName === "removed-member") {
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                JSON.stringify({ version: "1.0.0", removed: true }),
              ],
              ["SKILL.md", "# Removed member"],
            ]),
          };
        }
        throw new Error(`unexpected fetch of ${folderName}`);
      },
    );

    seedManifest(["claude"]);
    const exitCode = await runImport(["fine-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(
        join(target, ".claude", "skills", "removed-member", "SKILL.md"),
      ),
    ).toBe(true);
  });
});

describe("runImport — AF-5: --add-harness backfill", () => {
  function writeExistingManifest(
    harnesses: string[],
    skills: Record<string, unknown>,
  ) {
    writeFileSync(
      join(target, "hatch.manifest.json"),
      JSON.stringify({ schemaVersion: 3, harnesses, skills }, null, 2),
      "utf8",
    );
  }

  it("adds the harness to the manifest and backfills every standalone skill and group member, at their recorded versions, one commit", async () => {
    writeExistingManifest(["claude"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
      a: {
        version: "1.0.0",
        group: "my-group",
        contentHash: "placeholder-hash",
      },
      b: {
        version: "1.0.0",
        group: "my-group",
        contentHash: "placeholder-hash",
      },
      "my-group": { version: "1.0.0" },
    });

    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({ ok: true, exists: name === "example-skill" }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, name, ref) => {
        if (name === "example-skill") {
          expect(ref).toBe("example-skill@1.0.0");
          return { ok: true, files: skillFiles("1.0.0") };
        }
        if (name === "my-group") {
          expect(ref).toBe("my-group@1.0.0");
          return {
            ok: true,
            files: new Map([
              [
                "skill.json",
                groupSkillJson("1.0.0", [
                  { kind: "nested", name: "a" },
                  { kind: "nested", name: "b" },
                ]),
              ],
              ["a/SKILL.md", "# A"],
              ["b/SKILL.md", "# B"],
            ]),
          };
        }
        throw new Error(`unexpected fetch of ${name}`);
      },
    );

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".agents", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Example Skill");
    expect(
      readFileSync(join(target, ".agents", "skills", "a", "SKILL.md"), "utf8"),
    ).toBe("# A");
    expect(
      readFileSync(join(target, ".agents", "skills", "b", "SKILL.md"), "utf8"),
    ).toBe("# B");

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.harnesses).toEqual(["claude", "codex"]);
    // codex sorts after claude, so claude stays primary — its own placed
    // content was never touched, so every existing contentHash is untouched.
    expect(manifest.skills["example-skill"].contentHash).toBe(
      "placeholder-hash",
    );

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
    expect(log.latest?.message).toContain('add harness "codex"');
  });

  it("re-resolves the harness-suffixed variant fresh for the new harness, not a blind copy of an existing harness's placement", async () => {
    writeExistingManifest(["codex"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });

    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "example-skill-cld" || name === "example-skill",
      }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "example-skill-cld") {
        return { ok: true, files: skillFiles("1.0.0") };
      }
      return { ok: true, files: skillFiles("1.0.0") };
    });

    const exitCode = await runImport([
      "--add-harness",
      "claude",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "existing-session-token",
      "example-skill-cld",
      "example-skill@1.0.0",
    );
  });

  it("recomputes contentHash against the new primary harness when the added harness becomes primary", async () => {
    // codex is the sole (and thus primary) harness today; adding "claude"
    // makes claude the new primary (alphabetically first).
    writeExistingManifest(["codex"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: true,
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: skillFiles("1.0.0"),
    });

    const exitCode = await runImport([
      "--add-harness",
      "claude",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["example-skill"].contentHash).not.toBe(
      "placeholder-hash",
    );
    expect(manifest.skills["example-skill"].contentHash).toBe(
      hashEntries([["SKILL.md", "# Example Skill"]]),
    );
  });

  it("defaults to skipping a conflicting destination file when unattended, still completing the rest", async () => {
    writeExistingManifest(["claude"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });
    mkdirSync(join(target, ".agents", "skills", "example-skill"), {
      recursive: true,
    });
    writeFileSync(
      join(target, ".agents", "skills", "example-skill", "SKILL.md"),
      "# Pre-existing, not placed by Hatch",
      "utf8",
    );

    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: true,
    });
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: skillFiles("1.0.0"),
    });

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".agents", "skills", "example-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Pre-existing, not placed by Hatch");
    expect(consoleLogs.some((l) => l.includes("skipped"))).toBe(true);
  });

  it("aborts cleanly when a previously-imported skill has no resolvable folder for the new harness", async () => {
    writeExistingManifest(["claude"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: false,
    });

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("was not found in the registry")),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.harnesses).toEqual(["claude"]);
    expect(existsSync(join(target, ".agents"))).toBe(false);
  });

  it("aborts cleanly when the registry can't be reached", async () => {
    writeExistingManifest(["claude"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.harnesses).toEqual(["claude"]);
  });

  it("no-ops when the harness is already added to the project", async () => {
    writeExistingManifest(["claude", "codex"], {
      "example-skill": { version: "1.0.0", contentHash: "placeholder-hash" },
    });

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("already added"))).toBe(true);
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized harness code", async () => {
    writeExistingManifest(["claude"], {});

    const exitCode = await runImport([
      "--add-harness",
      "bogus",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes('unrecognized harness "bogus"')),
    ).toBe(true);
  });

  it("rejects when there is no manifest yet, naming `hatch init` as the remedy", async () => {
    const exitCode = await runImport([
      "--add-harness",
      "claude",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) =>
          m.includes("no hatch.manifest.json found") &&
          m.includes("hatch init"),
      ),
    ).toBe(true);
  });

  it("rejects combining --add-harness with a skill/group name", async () => {
    const exitCode = await runImport([
      "example-skill",
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);
    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("cannot be combined"))).toBe(
      true,
    );
  });
});

describe("runImport — testing content does not exist to an ordinary project (0027)", () => {
  // "_reimport-fixture" is a real, fetchable testing skill; "declared-fixture"
  // is testing content that reached the registry without the reserved prefix;
  // "ordinary-skill" is normal content. Nothing here exists for
  // "ghost-skill" — the control the refusals are compared against.
  function seedRegistry() {
    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: [
          "_reimport-fixture",
          "declared-fixture",
          "ordinary-skill",
        ].includes(name),
      }),
    );
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (
        path === "_reimport-fixture/skill.json" ||
        path === "declared-fixture/skill.json"
      ) {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", testing: true }),
        };
      }
      if (path === "ordinary-skill/skill.json") {
        return { ok: true, content: plainSkillJson("1.0.0") };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => ({
      ok: true,
      files: new Map([
        ["SKILL.md", `# ${name}`],
        ["skill.json", JSON.stringify({ version: "1.0.0", testing: true })],
      ]),
    }));
  }

  it("reports a testing skill exactly as it reports a name that does not exist", async () => {
    seedRegistry();
    seedManifest(["claude"]);
    await runImport(["ghost-skill", "--path", target]);
    const ghost = consoleErrors.at(-1);

    consoleErrors.length = 0;
    const exitCode = await runImport(["_reimport-fixture", "--path", target]);

    expect(exitCode).toBe(1);
    // Byte-identical but for the name — no hint the fixture is real.
    expect(consoleErrors.at(-1)).toBe(
      ghost?.replace("ghost-skill", "_reimport-fixture"),
    );
  });

  it("says nothing about testing content, in any wording", async () => {
    seedRegistry();
    seedManifest(["claude"]);

    await runImport(["_reimport-fixture", "--path", target]);

    const refusal = consoleErrors.at(-1) ?? "";
    expect(refusal).toContain("was not found in the registry");
    expect(refusal).not.toMatch(/testing|testProject|--test-project/i);
  });

  it("changes nothing when it refuses", async () => {
    seedRegistry();
    seedManifest(["claude"]);

    const exitCode = await runImport(["_reimport-fixture", "--path", target]);

    expect(exitCode).toBe(1);
    expectManifestUnchanged();
    expect(
      existsSync(join(target, ".claude", "skills", "_reimport-fixture")),
    ).toBe(false);
    expect(await commitCount(target)).toBe(0);
  });

  it("authenticates before refusing", async () => {
    seedRegistry();
    seedManifest(["claude"]);

    await runImport(["_reimport-fixture", "--path", target]);

    // The refusal is a registry-level outcome, not an argument check: it
    // happens on the far side of authentication, like any other not-found.
    expect(resolveToken).toHaveBeenCalled();
  });

  it("reports a pinned testing target as a missing ref, like any missing tag", async () => {
    seedRegistry();
    seedManifest(["claude"]);

    const exitCode = await runImport([
      "_reimport-fixture@1.0.0",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.at(-1)).toContain(
      '"_reimport-fixture@1.0.0" was not found in the registry',
    );
  });

  it("reports declared testing content without the prefix the same way", async () => {
    seedRegistry();
    seedManifest(["claude"]);

    const exitCode = await runImport(["declared-fixture", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.at(-1)).toContain(
      '"declared-fixture" was not found in the registry',
    );
    expect(consoleErrors.at(-1)).not.toMatch(/testing/i);
    expectManifestUnchanged();
  });

  it("imports a target whose skill.json predates the declaration", async () => {
    seedRegistry();
    seedManifest(["claude"]);
    // A version published before 0027 carries no `testing` field at all.
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => ({
      ok: true,
      files: new Map([
        ["SKILL.md", `# ${name}`],
        ["skill.json", plainSkillJson("1.0.0")],
      ]),
    }));

    const exitCode = await runImport(["ordinary-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "ordinary-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# ordinary-skill");
  });

  it("imports testing content into a project that opted in", async () => {
    seedRegistry();
    seedManifest(["claude"], {}, { testProject: true });

    const exitCode = await runImport(["_reimport-fixture", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "_reimport-fixture", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# _reimport-fixture");
    expect(readManifest().skills["_reimport-fixture"].version).toBe("1.0.0");
    expect(readManifest().testProject).toBe(true);
    expect(await commitCount(target)).toBe(1);
  });

  it("honors a pinned testing target in a project that opted in", async () => {
    seedRegistry();
    seedManifest(["claude"], {}, { testProject: true });

    const exitCode = await runImport([
      "_reimport-fixture@1.0.0",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    expect(readManifest().skills["_reimport-fixture"]).toEqual({
      version: "1.0.0",
      pin: { type: "exact", value: "1.0.0" },
      contentHash: expect.any(String),
    });
  });
});

describe("runImport — a group never smuggles testing content in (0027)", () => {
  // A real group pointing at one ordinary leaf and one testing leaf.
  function seedGroup(testingLeafName: string) {
    const members = [
      { kind: "pointer", name: "ordinary-leaf" },
      { kind: "pointer", name: testingLeafName },
    ];
    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "ordinary-leaf" || name === testingLeafName,
      }),
    );
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return { ok: true, content: groupSkillJson("1.0.0", members) };
      }
      if (path === "ordinary-leaf/skill.json") {
        return { ok: true, content: plainSkillJson("1.0.0") };
      }
      if (path === `${testingLeafName}/skill.json`) {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", testing: true }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "my-group") {
        return {
          ok: true,
          files: new Map([["skill.json", groupSkillJson("1.0.0", members)]]),
        };
      }
      return {
        ok: true,
        files: new Map([
          ["SKILL.md", `# ${name}`],
          [
            "skill.json",
            name === testingLeafName
              ? JSON.stringify({ version: "1.0.0", testing: true })
              : plainSkillJson("1.0.0"),
          ],
        ]),
      };
    });
  }

  it("aborts the whole import when a pointer names testing content", async () => {
    seedGroup("_fixture-leaf");
    seedManifest(["claude"]);

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(1);
    // Reported as a pointer at a name the registry does not have — the same
    // failure a genuinely dangling pointer produces.
    expect(consoleErrors.at(-1)).toContain(
      '"_fixture-leaf" (referenced by a pointer) was not found in the registry',
    );
    expect(consoleErrors.at(-1)).not.toMatch(/testing/i);
    expectManifestUnchanged();
    expect(existsSync(join(target, ".claude", "skills", "ordinary-leaf"))).toBe(
      false,
    );
    expect(await commitCount(target)).toBe(0);
  });

  it("aborts the whole import when a pointer's target declares itself testing content", async () => {
    seedGroup("declared-leaf");
    seedManifest(["claude"]);

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.at(-1)).toContain(
      '"declared-leaf" (referenced by a pointer) was not found in the registry',
    );
    expectManifestUnchanged();
    expect(existsSync(join(target, ".claude", "skills", "ordinary-leaf"))).toBe(
      false,
    );
  });

  it("places every member of the same group in a project that opted in", async () => {
    seedGroup("_fixture-leaf");
    seedManifest(["claude"], {}, { testProject: true });

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    for (const member of ["ordinary-leaf", "_fixture-leaf"]) {
      expect(
        readFileSync(
          join(target, ".claude", "skills", member, "SKILL.md"),
          "utf8",
        ),
      ).toBe(`# ${member}`);
      expect(readManifest().skills[member].group).toBe("my-group");
    }
  });
});

describe("runImport — --add-harness in a test project (0027)", () => {
  it("backfills a recorded testing skill exactly as it backfills ordinary content", async () => {
    writeFileSync(
      join(target, "hatch.manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 3,
          harnesses: ["claude"],
          testProject: true,
          skills: {
            "example-skill": { version: "1.0.0", contentHash: "placeholder" },
            "_reimport-fixture": {
              version: "1.0.0",
              contentHash: "placeholder",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "example-skill" || name === "_reimport-fixture",
      }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, name, ref) => {
        expect(ref).toBe(`${name}@1.0.0`);
        return {
          ok: true,
          files: new Map([
            ["SKILL.md", `# ${name}`],
            ["skill.json", JSON.stringify({ version: "1.0.0" })],
          ]),
        };
      },
    );

    const exitCode = await runImport([
      "--add-harness",
      "codex",
      "--path",
      target,
    ]);

    expect(exitCode).toBe(0);
    for (const name of ["example-skill", "_reimport-fixture"]) {
      expect(
        readFileSync(
          join(target, ".agents", "skills", name, "SKILL.md"),
          "utf8",
        ),
      ).toBe(`# ${name}`);
    }
    // The opt-in survives the manifest rewrite, so the next import still works.
    expect(readManifest().testProject).toBe(true);
    expect(readManifest().harnesses).toEqual(["claude", "codex"]);
  });
});

describe("runImport — caret-constrained group pointer", () => {
  function groupWithCaret(floor: string): string {
    return groupSkillJson("1.0.0", [
      { kind: "pointer", name: "shared", version: `^${floor}` },
    ]);
  }

  // A group whose sole member is a caret-constrained pointer at `shared`,
  // which the registry serves at `leafVersion`.
  function mockCaretGroup(groupJson: string, leafVersion: string) {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return { ok: true, content: groupJson };
      }
      if (path === "shared/skill.json") {
        return { ok: true, content: plainSkillJson(leafVersion) };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "my-group") {
        return { ok: true, files: new Map([["skill.json", groupJson]]) };
      }
      if (name === "shared") {
        return {
          ok: true,
          files: new Map([
            ["skill.json", plainSkillJson(leafVersion)],
            ["SKILL.md", "# shared"],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });
  }

  it("places the version the caret resolved to and names it in the summary", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0", "2.0.0"],
    });
    mockCaretGroup(groupWithCaret("1.0.0"), "1.3.0");
    seedManifest(["claude"]);

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(readManifest().skills.shared.version).toBe("1.3.0");
    expect(consoleLogs.join("\n")).toContain("v1.3.0");
  });

  it("surfaces the conflicting-constraint warning naming both and the version used", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.2.0", "1.4.0"],
    });
    const groupJson = groupSkillJson("1.0.0", [
      { kind: "pointer", name: "shared", version: "1.2.0" },
      { kind: "pointer", name: "shared", version: "^1.0.0" },
    ]);
    mockCaretGroup(groupJson, "1.4.0");
    seedManifest(["claude"]);

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    const output = consoleLogs.join("\n");
    expect(output).toContain("warning");
    expect(output).toContain("1.2.0");
    expect(output).toContain("1.4.0");
  });

  it("aborts an unsatisfiable caret without touching the project", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["2.0.0", "3.0.0"],
    });
    mockCaretGroup(groupWithCaret("1.0.0"), "1.0.0");
    seedManifest(["claude"]);
    const before = await commitCount(target);

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.join("\n")).toContain("^1.0.0");
    expect(existsSync(join(target, ".claude", "skills", "shared"))).toBe(false);
    expectManifestUnchanged();
    expect(await commitCount(target)).toBe(before);
  });

  it("re-resolves the caret on re-import and records no pin for the member", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0"],
    });
    mockCaretGroup(groupWithCaret("1.0.0"), "1.3.0");
    seedManifest(["claude"]);

    expect(await runImport(["my-group", "--path", target])).toBe(0);
    expect(readManifest().skills.shared.version).toBe("1.3.0");
    expect(readManifest().skills.shared.pin).toBeUndefined();

    // A newer version lands inside the same MAJOR; the group's own content
    // is untouched, so only a fresh resolution can pick it up.
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0", "1.4.0"],
    });
    mockCaretGroup(groupWithCaret("1.0.0"), "1.4.0");

    expect(await runImport(["my-group", "--path", target])).toBe(0);
    expect(readManifest().skills.shared.version).toBe("1.4.0");
    expect(readManifest().skills.shared.pin).toBeUndefined();
  });
});

describe("runImport — group re-import resolves before declaring a no-op", () => {
  function caretGroupJson(): string {
    return groupSkillJson("1.0.0", [
      { kind: "pointer", name: "shared", version: "^1.0.0" },
    ]);
  }

  function mockCaretGroup(leafVersion: string) {
    const groupJson = caretGroupJson();
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return { ok: true, content: groupJson };
      }
      if (path === "shared/skill.json") {
        return { ok: true, content: plainSkillJson(leafVersion) };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "my-group") {
        return { ok: true, files: new Map([["skill.json", groupJson]]) };
      }
      if (name === "shared") {
        return {
          ok: true,
          files: new Map([
            ["skill.json", plainSkillJson(leafVersion)],
            ["SKILL.md", "# shared"],
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });
  }

  it("reports up to date with no manifest change and no commit when nothing moved", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0"],
    });
    mockCaretGroup("1.3.0");
    seedManifest(["claude"]);

    expect(await runImport(["my-group", "--path", target])).toBe(0);
    const manifestBefore = readFileSync(
      join(target, "hatch.manifest.json"),
      "utf8",
    );
    const commitsBefore = await commitCount(target);

    consoleLogs.length = 0;
    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("already up to date"))).toBe(
      true,
    );
    expect(readFileSync(join(target, "hatch.manifest.json"), "utf8")).toBe(
      manifestBefore,
    );
    expect(await commitCount(target)).toBe(commitsBefore);
  });

  it("still resolves the member graph before saying so", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.3.0"],
    });
    mockCaretGroup("1.3.0");
    seedManifest(["claude"]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    vi.mocked(fetchPublishedVersions).mockClear();
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    // The point of option 2: the no-op is a conclusion drawn from a real
    // resolution, not an assumption made from the group's own version.
    expect(fetchPublishedVersions).toHaveBeenCalled();
  });
});

describe("runImport — caret auto-update keeps contentHash coherent", () => {
  // A group whose sole member is a caret pointer at `shared`, served at
  // `leafVersion` with `leafFiles` as its content.
  function mockCaretGroup(
    leafVersion: string,
    leafFiles: Array<[string, string]>,
  ) {
    const groupJson = groupSkillJson("1.0.0", [
      { kind: "pointer", name: "shared", version: "^1.0.0" },
    ]);
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "my-group/skill.json") {
        return { ok: true, content: groupJson };
      }
      if (path === "shared/skill.json") {
        return { ok: true, content: plainSkillJson(leafVersion) };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });
    vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
      if (name === "my-group") {
        return { ok: true, files: new Map([["skill.json", groupJson]]) };
      }
      if (name === "shared") {
        return {
          ok: true,
          files: new Map([
            ["skill.json", plainSkillJson(leafVersion)],
            ...leafFiles,
          ]),
        };
      }
      throw new Error(`unexpected fetch of ${name}`);
    });
  }

  it("rewrites the member's contentHash when a caret update changes file content", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0"],
    });
    mockCaretGroup("1.0.0", [["SKILL.md", "# v1"]]);
    seedManifest(["claude"]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);
    const firstHash = readManifest().skills.shared.contentHash;

    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.0.1"],
    });
    mockCaretGroup("1.0.1", [["SKILL.md", "# v2"]]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    expect(readManifest().skills.shared.version).toBe("1.0.1");
    expect(readManifest().skills.shared.contentHash).not.toBe(firstHash);
    expect(readManifest().skills.shared.contentHash).toBe(
      hashEntries([["SKILL.md", "# v2"]]),
    );
  });

  it("does not falsely report local edits on the import after a caret update", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0"],
    });
    mockCaretGroup("1.0.0", [["SKILL.md", "# v1"]]);
    seedManifest(["claude"]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.0.1"],
    });
    mockCaretGroup("1.0.1", [["SKILL.md", "# v2"]]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    // Third run, nothing new published: the stored hash must still match
    // what is on disk, or drift detection fires on content Hatch itself
    // placed.
    consoleLogs.length = 0;
    expect(await runImport(["my-group", "--path", target])).toBe(0);
    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(consoleLogs.some((m) => m.includes("already up to date"))).toBe(
      true,
    );
  });

  it("does not falsely report local edits when a caret update adds a file", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0"],
    });
    mockCaretGroup("1.0.0", [["SKILL.md", "# v1"]]);
    seedManifest(["claude"]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    // 1.0.1 ships an extra file the placed 1.0.0 never had.
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.0.1"],
    });
    mockCaretGroup("1.0.1", [
      ["SKILL.md", "# v1"],
      ["reference/extra.md", "# extra"],
    ]);
    consoleLogs.length = 0;
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(readManifest().skills.shared.version).toBe("1.0.1");
    expect(
      existsSync(
        join(target, ".claude", "skills", "shared", "reference", "extra.md"),
      ),
    ).toBe(true);
  });

  it("still detects a genuine local edit made after a caret update", async () => {
    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.0.1"],
    });
    mockCaretGroup("1.0.1", [["SKILL.md", "# v2"]]);
    seedManifest(["claude"]);
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    writeFileSync(
      join(target, ".claude", "skills", "shared", "SKILL.md"),
      "# hand-edited",
      "utf8",
    );

    vi.mocked(fetchPublishedVersions).mockResolvedValue({
      ok: true,
      versions: ["1.0.0", "1.0.1", "1.0.2"],
    });
    mockCaretGroup("1.0.2", [["SKILL.md", "# v3"]]);
    consoleLogs.length = 0;
    expect(await runImport(["my-group", "--path", target])).toBe(0);

    expect(consoleLogs.join("\n")).toContain("local edits");
    expect(
      readFileSync(
        join(target, ".claude", "skills", "shared", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# hand-edited");
  });
});

describe("runImport — a version that changes its file list is not a local edit", () => {
  function mockStandaloneWithFiles(
    version: string,
    files: Array<[string, string]>,
  ) {
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) =>
      path === "example-skill/skill.json"
        ? { ok: true, content: plainSkillJson(version) }
        : { ok: false, reason: "not-found", detail: "not found" },
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(async () => ({
      ok: true,
      files: new Map([["skill.json", plainSkillJson(version)], ...files]),
    }));
  }

  it("updates a standalone skill whose new version adds a file", async () => {
    mockStandaloneWithFiles("1.0.0", [["SKILL.md", "# v1"]]);
    seedManifest(["claude"]);
    expect(await runImport(["example-skill", "--path", target])).toBe(0);

    mockStandaloneWithFiles("1.1.0", [
      ["SKILL.md", "# v1"],
      ["reference/extra.md", "# extra"],
    ]);
    consoleLogs.length = 0;
    expect(await runImport(["example-skill", "--path", target])).toBe(0);

    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(readManifest().skills["example-skill"].version).toBe("1.1.0");
    expect(
      existsSync(
        join(
          target,
          ".claude",
          "skills",
          "example-skill",
          "reference",
          "extra.md",
        ),
      ),
    ).toBe(true);
  });

  it("updates a standalone skill whose new version drops a file, and stays clean afterwards", async () => {
    mockStandaloneWithFiles("1.0.0", [
      ["SKILL.md", "# v1"],
      ["reference/old.md", "# old"],
    ]);
    seedManifest(["claude"]);
    expect(await runImport(["example-skill", "--path", target])).toBe(0);

    mockStandaloneWithFiles("1.1.0", [["SKILL.md", "# v1"]]);
    consoleLogs.length = 0;
    expect(await runImport(["example-skill", "--path", target])).toBe(0);
    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(readManifest().skills["example-skill"].version).toBe("1.1.0");

    // The import after a file-dropping update must still read as clean:
    // whatever the update left on disk has to agree with the hash it
    // recorded, or drift fires on Hatch's own handiwork.
    consoleLogs.length = 0;
    expect(await runImport(["example-skill", "--path", target])).toBe(0);
    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(consoleLogs.some((m) => m.includes("already up to date"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Migrating a harness whose directory has moved (ADR-0033).
//
// `codex` records `.agents/skills` as its directory and `.codex/skills` as the
// one it used to occupy. A project that imported before the move is holding
// content the harness can no longer find — or, once an import places a fresh
// copy, a second stale copy it still would. One pass over the manifest's
// recorded names answers both: present only in the previous directory, an
// entry is *moved* across; present in both, the previous copy is *reclaimed*.
// ---------------------------------------------------------------------------

const LEGACY_DIR = ".codex";
const CURRENT_DIR = ".agents";

function legacyDirOf(name: string): string {
  return join(target, LEGACY_DIR, "skills", name);
}

function currentDirOf(name: string): string {
  return join(target, CURRENT_DIR, "skills", name);
}

// The shape a project carries when it last imported before codex's directory
// moved: content sitting at the harness's previously occupied location.
function placeLegacy(name: string, content = `# legacy ${name}`): void {
  const dir = legacyDirOf(name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf8");
}

function placeCurrent(name: string, content = `# current ${name}`): void {
  const dir = currentDirOf(name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf8");
}

function movedLine(name: string): string {
  return `  moved ".codex/skills/${name}" to ".agents/skills/${name}" — carried across to the directory the "codex" harness now uses.`;
}

function reclaimedLine(name: string): string {
  return `  reclaimed ".codex/skills/${name}" — removed from the directory the "codex" harness no longer uses.`;
}

// Every line the migration pass contributed to the summary, in the order it
// printed them.
function migrationLines(): string[] {
  return consoleLogs.filter(
    (line) => line.startsWith('  moved "') || line.startsWith('  reclaimed "'),
  );
}

// A standalone skill the registry serves at `version`, and nothing else.
function mockSkill(
  name: string,
  version: string,
  files: Array<[string, string]> = [["SKILL.md", `# ${name} v${version}`]],
) {
  vi.mocked(registryFolderExists).mockImplementation(
    async (_token, folderName) => ({ ok: true, exists: folderName === name }),
  );
  vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) =>
    path === `${name}/skill.json`
      ? { ok: true, content: plainSkillJson(version) }
      : { ok: false, reason: "not-found", detail: "not found" },
  );
  vi.mocked(fetchRegistryFolder).mockImplementation(async () => ({
    ok: true,
    files: new Map([["skill.json", plainSkillJson(version)], ...files]),
  }));
}

// A one-nested-member group, for the paths that return early at group level.
function mockNestedGroup(version: string) {
  const groupJson = groupSkillJson(version, [{ kind: "nested", name: "a" }]);
  vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) =>
    path === "my-group/skill.json"
      ? { ok: true, content: groupJson }
      : { ok: false, reason: "not-found", detail: "not found" },
  );
  vi.mocked(fetchRegistryFolder).mockImplementation(async (_token, name) => {
    if (name === "my-group") {
      return {
        ok: true,
        files: new Map([
          ["skill.json", groupJson],
          ["a/SKILL.md", "# A"],
        ]),
      };
    }
    throw new Error(`unexpected fetch of ${name}`);
  });
}

// A commit stub that fails, so a run can be observed rolling back.
function breakTheCommit() {
  vi.mocked(simpleGit).mockImplementationOnce(
    () =>
      ({
        checkIsRepo: vi.fn().mockResolvedValue(true),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockRejectedValue(new Error("simulated git failure")),
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
      }) as any,
  );
}

describe("runImport — reclaiming a harness's previously occupied directory", () => {
  it("clears every manifest-recorded entry out of the previous directory and retires it once emptied", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      beta: { version: "1.0.0" },
    });
    placeLegacy("alpha");
    placeLegacy("beta");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    // The requested import completes as it otherwise would.
    expect(
      readFileSync(join(currentDirOf("example-skill"), "SKILL.md"), "utf8"),
    ).toBe("# Example Skill");
    expect(Object.keys(readManifest().skills).sort()).toEqual([
      "alpha",
      "beta",
      "example-skill",
    ]);

    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(existsSync(legacyDirOf("beta"))).toBe(false);
    // Nothing left behind, so the directory and its parent are retired too.
    expect(existsSync(join(target, LEGACY_DIR, "skills"))).toBe(false);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
  });

  it("covers manifest entries the import was not asked for", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      // No contentHash: the v1/v2 entry shape a project that last imported
      // before the directory moved actually carries.
      beta: { version: "1.0.0" },
    });
    placeLegacy("alpha");
    placeLegacy("beta");
    mockSkill("beta", "1.1.0", [["SKILL.md", "# beta v1.1"]]);

    const exitCode = await runImport(["beta", "--path", target]);

    expect(exitCode).toBe(0);
    expect(readManifest().skills.beta.version).toBe("1.1.0");
    // Not only the named target: alpha comes out of the legacy directory too.
    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(existsSync(legacyDirOf("beta"))).toBe(false);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    expect(migrationLines().sort()).toEqual([
      movedLine("alpha"),
      movedLine("beta"),
    ]);
  });

  it("runs only for a harness the project declares", async () => {
    // `claude` records no previous directory, so a `.codex/skills/` that
    // happens to sit in this project is none of import's business.
    seedManifest(["claude"], { alpha: { version: "1.0.0" } });
    placeLegacy("alpha");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(readFileSync(join(legacyDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# legacy alpha",
    );
    expect(existsSync(join(target, LEGACY_DIR, "skills"))).toBe(true);
    expect(migrationLines()).toEqual([]);
  });

  it("is a no-op that creates nothing when the previously occupied directory is absent", async () => {
    seedManifest(["codex"], { alpha: { version: "1.0.0" } });

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(join(currentDirOf("example-skill"), "SKILL.md"), "utf8"),
    ).toBe("# Example Skill");
    // Nothing conjured up for the location this project never used.
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    expect(migrationLines()).toEqual([]);
  });

  it("leaves content it never recorded in place, keeping the directories that hold it", async () => {
    seedManifest(["codex"], { alpha: { version: "1.0.0" } });
    placeLegacy("alpha");
    placeLegacy("unrelated", "# hand-written, never recorded");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(
      readFileSync(join(legacyDirOf("unrelated"), "SKILL.md"), "utf8"),
    ).toBe("# hand-written, never recorded");
    // Not empty, so neither the directory nor its parent is retired.
    expect(existsSync(join(target, LEGACY_DIR, "skills"))).toBe(true);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(true);
    expect(migrationLines()).toEqual([movedLine("alpha")]);
  });

  it("puts the placed content, the relocation and the reclamation in one commit", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      gamma: { version: "1.0.0" },
    });
    placeLegacy("alpha"); // previous directory only — relocated
    placeCurrent("gamma"); // present in both — reclaimed
    placeLegacy("gamma");
    // Commit the pre-migration state first, so the import's own commit is the
    // only place the migration can show up.
    await simpleGit(target).add(".");
    await simpleGit(target).commit("seed");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(await commitCount(target)).toBe(2); // the seed, plus one for the import
    // Rename detection off, so a relocation reads as the delete/add pair it
    // is on disk and every effect is visible in one listing.
    const changed = await simpleGit(target).raw([
      "diff",
      "--name-status",
      "--no-renames",
      "HEAD~1",
      "HEAD",
    ]);
    // The relocation...
    expect(changed).toContain("D\t.codex/skills/alpha/SKILL.md");
    expect(changed).toContain("A\t.agents/skills/alpha/SKILL.md");
    // ...the reclamation...
    expect(changed).toContain("D\t.codex/skills/gamma/SKILL.md");
    // ...and the content this import placed.
    expect(changed).toContain("A\t.agents/skills/example-skill/SKILL.md");
    // gamma's authoritative copy never moved, so it is not in the diff at all.
    expect(changed).not.toContain(".agents/skills/gamma/SKILL.md");
  });
});

describe("runImport — carrying content across to the harness's current directory", () => {
  it("moves a recorded entry across byte-for-byte, leaving its manifest entry alone", async () => {
    const seededEntry = {
      version: "1.2.3",
      contentHash: "recorded-when-it-was-placed",
      pin: { type: "range", value: "1.0.0" },
    };
    seedManifest(["codex"], { alpha: seededEntry });

    // Bytes chosen to survive nothing but a byte-for-byte move: mixed line
    // endings, non-ASCII, and a non-text payload in a nested folder.
    const skillBytes = Buffer.from("# alpha — v1.2.3\r\nsecond line\n", "utf8");
    const assetBytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x7f, 0x80]);
    mkdirSync(join(legacyDirOf("alpha"), "assets"), { recursive: true });
    writeFileSync(join(legacyDirOf("alpha"), "SKILL.md"), skillBytes);
    writeFileSync(join(legacyDirOf("alpha"), "assets", "logo.bin"), assetBytes);

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    // Present in the harness's current directory...
    expect(
      readFileSync(join(currentDirOf("alpha"), "SKILL.md")).equals(skillBytes),
    ).toBe(true);
    expect(
      readFileSync(join(currentDirOf("alpha"), "assets", "logo.bin")).equals(
        assetBytes,
      ),
    ).toBe(true);
    // ...and gone from the one it used to occupy.
    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);

    // Moved on disk, never re-fetched: nothing about the recorded entry moved
    // with it. Only `example-skill` was ever fetched.
    const alpha = readManifest().skills.alpha;
    expect(alpha.version).toBe("1.2.3");
    expect(alpha.contentHash).toBe("recorded-when-it-was-placed");
    expect(alpha.pin).toEqual({ type: "range", value: "1.0.0" });
    expect(vi.mocked(fetchRegistryFolder).mock.calls.map((c) => c[1])).toEqual([
      "example-skill",
    ]);
  });

  // Regression: before relocation existed, an already-current entry sitting
  // only in the previous directory hashed as an empty tree in the harness's
  // current directory, so import returned at the local-edit check without ever
  // reaching the migration.
  it("reclaims the legacy directory when the named target is already recorded and already current", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      beta: { version: "1.0.0" },
    });
    placeLegacy("alpha");
    placeLegacy("beta");
    // The registry serves exactly the version the manifest already records.
    mockSkill("alpha", "1.0.0");

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    // "the requested import completes as it otherwise would"
    expect(consoleLogs.some((l) => l.includes("already up to date"))).toBe(
      true,
    );
    expect(consoleLogs.join("\n")).not.toContain("local edits");
    // Both recorded entries are out of the legacy directory, and it is gone.
    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(existsSync(legacyDirOf("beta"))).toBe(false);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    // Carried across rather than dropped.
    expect(readFileSync(join(currentDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# legacy alpha",
    );
    expect(readFileSync(join(currentDirOf("beta"), "SKILL.md"), "utf8")).toBe(
      "# legacy beta",
    );
  });

  // Regression: the same misfire on the update path — a v3 entry carrying a
  // contentHash, whose content was still in the previous directory, was
  // reported as locally edited on every import, which blocked the very update
  // that would have placed it.
  it("updates a recorded entry whose content still sits in the previous directory, with no local-edit misfire", async () => {
    const placed = "# alpha v1.0.0";
    seedManifest(["codex"], {
      alpha: {
        version: "1.0.0",
        contentHash: hashEntries([["SKILL.md", placed]]),
      },
    });
    placeLegacy("alpha", placed);
    mockSkill("alpha", "1.1.0", [["SKILL.md", "# alpha v1.1.0"]]);

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.join("\n")).not.toContain("local edits");
    expect(readManifest().skills.alpha.version).toBe("1.1.0");
    expect(readFileSync(join(currentDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# alpha v1.1.0",
    );
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    expect(migrationLines()).toEqual([movedLine("alpha")]);
  });

  it("carries a locally edited entry across with its edit, then reports the edit", async () => {
    const recorded = "# alpha as Hatch placed it";
    seedManifest(["codex"], {
      alpha: {
        version: "1.0.0",
        contentHash: hashEntries([["SKILL.md", recorded]]),
      },
    });
    placeLegacy("alpha", "# alpha, hand-edited by the developer");
    mockSkill("alpha", "1.1.0", [["SKILL.md", "# alpha v1.1.0"]]);

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    // The edit arrives intact, and is not overwritten by the update.
    expect(readFileSync(join(currentDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# alpha, hand-edited by the developer",
    );
    // Reported exactly as an edit made in the current directory would be.
    expect(consoleLogs).toContain(
      'hatch import: "alpha" has local edits — left untouched.',
    );
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    expectManifestUnchanged();
  });

  it("leaves an entry present in both directories untouched in the current one", async () => {
    seedManifest(["codex"], { alpha: { version: "1.0.0" } });
    placeCurrent("alpha", "# the authoritative copy");
    placeLegacy("alpha", "# the stale copy");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    expect(readFileSync(join(currentDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# the authoritative copy",
    );
    expect(existsSync(legacyDirOf("alpha"))).toBe(false);
    expect(existsSync(join(target, LEGACY_DIR))).toBe(false);
    // Reclaimed, not relocated.
    expect(migrationLines()).toEqual([reclaimedLine("alpha")]);
  });
});

describe("runImport — the migration is part of the import's transaction", () => {
  it("puts moved content back, removes the relocation destination, and commits nothing when the import fails", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      gamma: { version: "1.0.0" },
    });
    placeLegacy("alpha", "# legacy alpha"); // relocated
    placeCurrent("gamma", "# current gamma"); // reclaimed
    placeLegacy("gamma", "# legacy gamma");
    breakTheCommit();

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    // The move is undone at both ends...
    expect(readFileSync(join(legacyDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# legacy alpha",
    );
    expect(existsSync(currentDirOf("alpha"))).toBe(false);
    // ...the reclaimed copy is back...
    expect(readFileSync(join(legacyDirOf("gamma"), "SKILL.md"), "utf8")).toBe(
      "# legacy gamma",
    );
    expect(readFileSync(join(currentDirOf("gamma"), "SKILL.md"), "utf8")).toBe(
      "# current gamma",
    );
    // ...nothing this run placed survives...
    expect(existsSync(join(currentDirOf("example-skill"), "SKILL.md"))).toBe(
      false,
    );
    // ...the manifest is byte-identical...
    expectManifestUnchanged();
    // ...and nothing was committed.
    expect(await commitCount(target)).toBe(0);
  });

  it("still reports “nothing was changed” verbatim when a refusal follows no migration at all", async () => {
    seedManifest(["codex"]);
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: false,
    });

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors).toEqual([
      'hatch import: "example-skill" was not found in the registry for harness "codex" — nothing was changed.',
    ]);
  });

  it("restores the migration and makes the same claim when a refusal follows one", async () => {
    seedManifest(["codex"], { alpha: { version: "1.0.0" } });
    placeLegacy("alpha");
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: false,
    });

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(1);
    // Byte-identical to the refusal above: the project really was put back.
    expect(consoleErrors).toEqual([
      'hatch import: "example-skill" was not found in the registry for harness "codex" — nothing was changed.',
    ]);
    expect(readFileSync(join(legacyDirOf("alpha"), "SKILL.md"), "utf8")).toBe(
      "# legacy alpha",
    );
    expect(existsSync(currentDirOf("alpha"))).toBe(false);
    expect(await commitCount(target)).toBe(0);
  });
});

describe("runImport — an otherwise unchanged import still commits the migration", () => {
  const migrationCommit = "hatch import: migrate harness directories";

  it("commits and reports on the AF-10 standing-exact-pin path", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0", pin: { type: "exact", value: "1.0.0" } },
    });
    placeLegacy("alpha");

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs).toContain(
      'hatch import: "alpha" is pinned at v1.0.0 — left untouched.',
    );
    expect(migrationLines()).toEqual([movedLine("alpha")]);
    expect(await commitCount(target)).toBe(1);
    expect((await simpleGit(target).log()).latest?.message).toBe(
      `${migrationCommit} (1 moved, 0 reclaimed)`,
    );
  });

  it("commits and reports on the group already-up-to-date path", async () => {
    seedManifest(["codex"], {
      "my-group": { version: "1.0.0" },
      a: { version: "1.0.0", group: "my-group" },
    });
    placeLegacy("a");
    mockNestedGroup("1.0.0");

    const exitCode = await runImport(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("already up to date"))).toBe(
      true,
    );
    expect(migrationLines()).toEqual([movedLine("a")]);
    expect(await commitCount(target)).toBe(1);
    expect((await simpleGit(target).log()).latest?.message).toBe(
      `${migrationCommit} (1 moved, 0 reclaimed)`,
    );
  });

  it("commits and reports on the standalone already-up-to-date path", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      gamma: { version: "1.0.0" },
    });
    placeLegacy("alpha"); // relocated
    placeCurrent("gamma"); // present in both — reclaimed
    placeLegacy("gamma");
    mockSkill("alpha", "1.0.0");

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("already up to date"))).toBe(
      true,
    );
    // Moved lines precede reclaimed lines, and both print last.
    expect(migrationLines()).toEqual([
      movedLine("alpha"),
      reclaimedLine("gamma"),
    ]);
    expect(consoleLogs.slice(-2)).toEqual([
      movedLine("alpha"),
      reclaimedLine("gamma"),
    ]);
    expect(await commitCount(target)).toBe(1);
    expect((await simpleGit(target).log()).latest?.message).toBe(
      `${migrationCommit} (1 moved, 1 reclaimed)`,
    );
  });

  it("commits and reports on the standalone local-edits path", async () => {
    seedManifest(["codex"], {
      alpha: {
        version: "1.0.0",
        contentHash: hashEntries([["SKILL.md", "# alpha as Hatch placed it"]]),
      },
    });
    placeLegacy("alpha", "# alpha, hand-edited");
    mockSkill("alpha", "1.1.0", [["SKILL.md", "# alpha v1.1.0"]]);

    const exitCode = await runImport(["alpha", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs).toContain(
      'hatch import: "alpha" has local edits — left untouched.',
    );
    expect(migrationLines()).toEqual([movedLine("alpha")]);
    expect(await commitCount(target)).toBe(1);
    expect((await simpleGit(target).log()).latest?.message).toBe(
      `${migrationCommit} (1 moved, 0 reclaimed)`,
    );
  });

  it("makes no commit and says nothing about a migration on any of those paths when there was none", async () => {
    // AF-10 standing exact pin.
    seedManifest(["codex"], {
      alpha: { version: "1.0.0", pin: { type: "exact", value: "1.0.0" } },
    });
    expect(await runImport(["alpha", "--path", target])).toBe(0);
    expect(consoleLogs).toContain(
      'hatch import: "alpha" is pinned at v1.0.0 — left untouched.',
    );
    expect(migrationLines()).toEqual([]);
    expect(await commitCount(target)).toBe(0);

    // Standalone already up to date.
    consoleLogs.length = 0;
    seedManifest(["codex"], { alpha: { version: "1.0.0" } });
    placeCurrent("alpha");
    mockSkill("alpha", "1.0.0");
    expect(await runImport(["alpha", "--path", target])).toBe(0);
    expect(consoleLogs.some((l) => l.includes("already up to date"))).toBe(
      true,
    );
    expect(migrationLines()).toEqual([]);
    expect(await commitCount(target)).toBe(0);

    // Standalone local edits.
    consoleLogs.length = 0;
    seedManifest(["codex"], {
      alpha: { version: "1.0.0", contentHash: "never-matches-what-is-on-disk" },
    });
    mockSkill("alpha", "1.1.0", [["SKILL.md", "# alpha v1.1.0"]]);
    expect(await runImport(["alpha", "--path", target])).toBe(0);
    expect(consoleLogs).toContain(
      'hatch import: "alpha" has local edits — left untouched.',
    );
    expect(migrationLines()).toEqual([]);
    expect(await commitCount(target)).toBe(0);

    // Group already up to date.
    consoleLogs.length = 0;
    seedManifest(["codex"], {
      "my-group": { version: "1.0.0" },
      a: { version: "1.0.0", group: "my-group" },
    });
    mockNestedGroup("1.0.0");
    expect(await runImport(["my-group", "--path", target])).toBe(0);
    expect(consoleLogs.some((l) => l.includes("already up to date"))).toBe(
      true,
    );
    expect(migrationLines()).toEqual([]);
    expect(await commitCount(target)).toBe(0);
  });
});

describe("runImport — the migration is reported", () => {
  it("names what moved and what was reclaimed, moved first, printed last", async () => {
    seedManifest(["codex"], {
      alpha: { version: "1.0.0" },
      gamma: { version: "1.0.0" },
    });
    placeLegacy("alpha"); // previous directory only — moved
    placeCurrent("gamma"); // present in both — reclaimed
    placeLegacy("gamma");

    const exitCode = await runImport(["example-skill", "--path", target]);

    expect(exitCode).toBe(0);
    // Exact wording, `/`-separated on every platform.
    expect(consoleLogs).toContain(
      '  moved ".codex/skills/alpha" to ".agents/skills/alpha" — carried across to the directory the "codex" harness now uses.',
    );
    expect(consoleLogs).toContain(
      '  reclaimed ".codex/skills/gamma" — removed from the directory the "codex" harness no longer uses.',
    );
    // After the import's own summary, moved before reclaimed, and last.
    expect(consoleLogs[0]).toContain('added "example-skill"');
    expect(consoleLogs.slice(-2)).toEqual([
      movedLine("alpha"),
      reclaimedLine("gamma"),
    ]);
  });
});
