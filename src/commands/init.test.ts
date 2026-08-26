import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashDiskTree } from "../manifest-migrations/content-hash.js";

vi.mock("../auth/credentials.js", () => ({
  resolveToken: vi.fn(),
  writeCredentials: vi.fn(),
}));
vi.mock("../auth/github-token.js", () => ({
  validateGitHubToken: vi.fn(),
}));
vi.mock("../cli/prompt.js", () => ({
  promptHidden: vi.fn(),
}));
vi.mock("../registry/fetch.js", () => ({
  fetchRegistryFolder: vi.fn(),
}));
// Wraps the real simpleGit so tests exercise real git plumbing by default;
// only the tests that need to observe or break the commit override it.
vi.mock("simple-git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("simple-git")>();
  return { ...actual, simpleGit: vi.fn(actual.simpleGit) };
});

const { resolveToken, writeCredentials } = await import(
  "../auth/credentials.js"
);
const { validateGitHubToken } = await import("../auth/github-token.js");
const { promptHidden } = await import("../cli/prompt.js");
const { fetchRegistryFolder } = await import("../registry/fetch.js");
const { simpleGit } = await import("simple-git");
const { runInit } = await import("./init.js");

let tempParent: string;
let consoleErrors: string[];
let consoleLogs: string[];

function skillFiles(version = "1.0.0"): Map<string, string> {
  return new Map([
    ["SKILL.md", "# Hatch Usage"],
    ["skill.json", `{"version":"${version}"}`],
  ]);
}

// An existing, plain directory — the state `hatch init` is defined against.
function plainProject(name = "myproj"): string {
  const dir = join(tempParent, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function gitProject(name = "myproj"): Promise<string> {
  const dir = plainProject(name);
  await simpleGit(dir).init();
  return dir;
}

function readManifest(project: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(project, "hatch.manifest.json"), "utf8"));
}

beforeEach(() => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-init-test-"));
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

  vi.mocked(resolveToken).mockReset().mockReturnValue("existing-session-token");
  vi.mocked(writeCredentials).mockReset();
  vi.mocked(validateGitHubToken).mockReset();
  vi.mocked(promptHidden).mockReset();
  vi.mocked(fetchRegistryFolder).mockReset().mockResolvedValue({
    ok: true,
    files: skillFiles(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempParent, { recursive: true, force: true });
});

describe("runInit — main flow", () => {
  it("writes the manifest and places the self-documentation skill in an existing directory", async () => {
    const project = await gitProject();

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(project, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Hatch Usage");
    expect(readManifest(project)).toEqual({
      schemaVersion: 4,
      harnesses: ["claude"],
      skills: {
        "hatch-usage": {
          version: "1.0.0",
          contentHash: hashDiskTree(
            join(project, ".claude", "skills", "hatch-usage"),
          ),
        },
      },
    });
  });

  // 0034-content-hash-recorded-by-every-placing-command.md: init places
  // content, so it records the baseline local-edit detection compares
  // against. An absent hash is read as "no baseline" by both `hatch import`
  // and `hatch remove`, which grandfather the item as clean — so without
  // this the self-documentation skill would be permanently unprotected.
  it("records a content hash matching the content it placed", async () => {
    const project = await gitProject();

    await runInit(["--path", project, "--harness", "claude"]);

    const skills = readManifest(project).skills as Record<
      string,
      { contentHash?: string }
    >;
    expect(skills["hatch-usage"]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(skills["hatch-usage"]?.contentHash).toBe(
      hashDiskTree(join(project, ".claude", "skills", "hatch-usage")),
    );
  });

  // A harness's directory is registry data, never manifest data (ADR-0033):
  // moving codex's directory must not change what the manifest records.
  it("records the harness by name, with no directory path of its own", async () => {
    const project = await gitProject();

    const exitCode = await runInit(["--path", project, "--harness", "codex"]);

    expect(exitCode).toBe(0);
    const manifest = readManifest(project);
    expect(manifest.harnesses).toEqual(["codex"]);
    // Nothing anywhere in the manifest names a directory.
    const raw = readFileSync(join(project, "hatch.manifest.json"), "utf8");
    expect(raw).not.toContain(".agents");
    expect(raw).not.toContain("skillsDir");
    expect(raw).not.toContain(".codex");
    // The content itself still lands in the registry-recorded directory.
    expect(
      readFileSync(
        join(project, ".agents", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Hatch Usage");
  });

  it("defaults the target to the current working directory when --path is omitted", async () => {
    const project = await gitProject();
    const originalCwd = process.cwd();
    process.chdir(project);
    try {
      const exitCode = await runInit(["--harness", "claude"]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(project, "hatch.manifest.json"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("does not create a git repository", async () => {
    const project = plainProject();

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(project, ".git"))).toBe(false);
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(true);
  });
});

describe("runInit — the target directory must already exist", () => {
  it("reports a missing target, creates nothing, and exits non-zero", async () => {
    const missing = join(tempParent, "nonexistent");

    const exitCode = await runInit(["--path", missing, "--harness", "claude"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("does not exist"))).toBe(true);
    expect(existsSync(missing)).toBe(false);
  });
});

describe("runInit — harness selection is required and validated", () => {
  it("requires --harness", async () => {
    const project = plainProject();

    const exitCode = await runInit(["--path", project]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("--harness <name[,name...]>")),
    ).toBe(true);
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("rejects an unrecognized harness before prompting for credentials or reaching the registry", async () => {
    const project = plainProject();

    const exitCode = await runInit(["--path", project, "--harness", "bogus"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("bogus"))).toBe(true);
    expect(resolveToken).not.toHaveBeenCalled();
    expect(promptHidden).not.toHaveBeenCalled();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
  });

  it("rejects an empty harness list", async () => {
    const project = plainProject();

    const exitCode = await runInit(["--path", project, "--harness", " , "]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
  });
});

describe("runInit — the self-documentation skill is always placed", () => {
  it("places identical content under every declared harness, recorded as one manifest entry", async () => {
    const project = await gitProject();

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude,codex",
    ]);

    expect(exitCode).toBe(0);
    const claude = readFileSync(
      join(project, ".claude", "skills", "hatch-usage", "SKILL.md"),
      "utf8",
    );
    const codex = readFileSync(
      join(project, ".agents", "skills", "hatch-usage", "SKILL.md"),
      "utf8",
    );
    expect(claude).toBe(codex);

    const manifest = readManifest(project);
    expect(manifest.harnesses).toEqual(["claude", "codex"]);
    expect(manifest.skills).toEqual({
      "hatch-usage": {
        version: "1.0.0",
        contentHash: hashDiskTree(
          join(project, ".claude", "skills", "hatch-usage"),
        ),
      },
    });
  });

  it("offers no opt-out — a skip-style argument is rejected as unrecognized", async () => {
    const project = plainProject();

    for (const skipFlag of ["--no-usage", "--skip-usage", "--no-self-doc"]) {
      consoleErrors.length = 0;
      const exitCode = await runInit([
        "--path",
        project,
        "--harness",
        "claude",
        skipFlag,
      ]);

      expect(exitCode).toBe(1);
      expect(
        consoleErrors.some(
          (m) => m.includes("unrecognized option") && m.includes(skipFlag),
        ),
      ).toBe(true);
      expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
      expect(existsSync(join(project, ".claude"))).toBe(false);
    }
  });

  it("never deploys registry-only files", async () => {
    const project = await gitProject();
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([
        ["SKILL.md", "# Hatch Usage"],
        ["skill.json", `{"version":"2.3.4"}`],
      ]),
    });

    await runInit(["--path", project, "--harness", "claude"]);

    const placed = join(project, ".claude", "skills", "hatch-usage");
    expect(existsSync(join(placed, "SKILL.md"))).toBe(true);
    expect(existsSync(join(placed, "skill.json"))).toBe(false);
    expect(readManifest(project).skills).toEqual({
      "hatch-usage": {
        version: "2.3.4",
        contentHash: hashDiskTree(placed),
      },
    });
  });
});

describe("runInit — initialization is atomic", () => {
  it("leaves nothing behind when the registry is unreachable", async () => {
    const project = plainProject();
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach GitHub (network down)",
    });

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("leaves nothing behind when authentication fails", async () => {
    const project = plainProject();
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("bad-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "GitHub rejected the token as invalid or expired",
    });

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("invalid password"))).toBe(
      true,
    );
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("removes content already placed under the first harness when the second fails", async () => {
    const project = plainProject();
    // Placement runs alphabetically (claude, then codex). A directory
    // squatting where codex's SKILL.md must be written makes that write —
    // and only that write — fail partway through.
    mkdirSync(join(project, ".agents", "skills", "hatch-usage", "SKILL.md"), {
      recursive: true,
    });

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude,codex",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("failed to initialize the project")),
    ).toBe(true);
    // Everything this run created under the first harness is gone...
    expect(existsSync(join(project, ".claude"))).toBe(false);
    // ...no manifest persists...
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(false);
    // ...and what was already on disk is untouched.
    expect(
      existsSync(join(project, ".agents", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(true);
  });

  it("makes no commit when initialization fails in a git project", async () => {
    const project = await gitProject();
    mkdirSync(join(project, ".agents", "skills", "hatch-usage", "SKILL.md"), {
      recursive: true,
    });

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude,codex",
    ]);

    expect(exitCode).toBe(1);
    // `git log` on a repo with no commits rejects — which is the assertion.
    await expect(simpleGit(project).log()).rejects.toThrow();
  });
});

describe("runInit — an already-initialized project is not re-initialized", () => {
  it("reports and exits 0 when every requested harness is already declared", async () => {
    const project = await gitProject();
    await runInit(["--path", project, "--harness", "claude"]);
    const manifestBefore = readFileSync(
      join(project, "hatch.manifest.json"),
      "utf8",
    );
    vi.mocked(fetchRegistryFolder).mockClear();
    consoleLogs.length = 0;

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("already initialized"))).toBe(
      true,
    );
    expect(readFileSync(join(project, "hatch.manifest.json"), "utf8")).toBe(
      manifestBefore,
    );
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("exits non-zero naming `hatch import --add-harness` when the request names an undeclared harness", async () => {
    const project = await gitProject();
    await runInit(["--path", project, "--harness", "claude"]);
    const manifestBefore = readFileSync(
      join(project, "hatch.manifest.json"),
      "utf8",
    );
    vi.mocked(fetchRegistryFolder).mockClear();
    consoleErrors.length = 0;

    const exitCode = await runInit(["--path", project, "--harness", "codex"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("already initialized"))).toBe(
      true,
    );
    expect(
      consoleErrors.some((m) => m.includes("hatch import --add-harness")),
    ).toBe(true);
    expect(readFileSync(join(project, "hatch.manifest.json"), "utf8")).toBe(
      manifestBefore,
    );
    expect(readManifest(project).harnesses).toEqual(["claude"]);
    expect(existsSync(join(project, ".agents"))).toBe(false);
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });

  it("treats a subset of the declared harnesses as already in the desired state", async () => {
    const project = await gitProject();
    await runInit(["--path", project, "--harness", "claude,codex"]);
    consoleLogs.length = 0;

    const exitCode = await runInit(["--path", project, "--harness", "codex"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("already initialized"))).toBe(
      true,
    );
  });
});

describe("runInit — version control", () => {
  it("records the manifest and the placed skill in exactly one commit", async () => {
    const project = await gitProject();

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    const git = simpleGit(project);
    const log = await git.log();
    expect(log.total).toBe(1);

    const committed = (
      await git.raw(["show", "--pretty=format:", "--name-only", "HEAD"])
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(committed).toContain("hatch.manifest.json");
    expect(committed).toContain(".claude/skills/hatch-usage/SKILL.md");
    expect((await git.status()).isClean()).toBe(true);
  });

  it("completes without attempting a commit when the project is not a repository", async () => {
    const project = plainProject();
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

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(commit).not.toHaveBeenCalled();
    expect(existsSync(join(project, "hatch.manifest.json"))).toBe(true);
  });

  it("warns that the project is not version-controlled, without changing the exit code", async () => {
    const project = plainProject();

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      true,
    );
  });

  it("warns at command entry, on a run that aborts long before it would commit", async () => {
    const project = plainProject();
    writeFileSync(
      join(project, "hatch.manifest.json"),
      JSON.stringify({ schemaVersion: 3, harnesses: ["claude"], skills: {} }),
      "utf8",
    );

    const exitCode = await runInit(["--path", project, "--harness", "codex"]);

    expect(exitCode).toBe(1);
    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      true,
    );
  });

  it("stays silent about version control in a repository root", async () => {
    const project = await gitProject();

    await runInit(["--path", project, "--harness", "claude"]);

    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      false,
    );
  });
});

describe("runInit — test-project opt-in (0027)", () => {
  it("records testProject: true when the flag is given", async () => {
    const project = await gitProject();

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude",
      "--test-project",
    ]);

    expect(exitCode).toBe(0);
    expect(readManifest(project).testProject).toBe(true);
  });

  it("records no testProject field without the flag", async () => {
    const project = await gitProject();

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(readManifest(project)).not.toHaveProperty("testProject");
  });

  it("changes nothing else about initialization", async () => {
    const plain = await gitProject("plain");
    const flagged = await gitProject("flagged");

    expect(await runInit(["--path", plain, "--harness", "claude,codex"])).toBe(
      0,
    );
    expect(
      await runInit([
        "--path",
        flagged,
        "--harness",
        "claude,codex",
        "--test-project",
      ]),
    ).toBe(0);

    const { testProject, ...flaggedRest } = readManifest(flagged);
    expect(testProject).toBe(true);
    // Harness recording, the skill entry and its version are untouched.
    expect(flaggedRest).toEqual(readManifest(plain));

    // The skill is still placed once per declared harness, with identical
    // content, and the whole scaffold is still one commit.
    for (const dir of [".claude", ".agents"]) {
      expect(
        readFileSync(
          join(flagged, dir, "skills", "hatch-usage", "SKILL.md"),
          "utf8",
        ),
      ).toBe("# Hatch Usage");
    }
    expect((await simpleGit(flagged).log()).total).toBe(1);
  });
});

describe("runInit — --test-project cannot be applied retroactively (0027)", () => {
  it("warns that the flag had no effect, and leaves the manifest untouched", async () => {
    const project = await gitProject();
    expect(await runInit(["--path", project, "--harness", "claude"])).toBe(0);
    const before = readFileSync(join(project, "hatch.manifest.json"), "utf8");

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude",
      "--test-project",
    ]);

    expect(exitCode).toBe(0);
    expect(
      consoleLogs.some(
        (m) =>
          m.includes("--test-project had no effect") &&
          m.includes("already initialized"),
      ),
    ).toBe(true);
    expect(readFileSync(join(project, "hatch.manifest.json"), "utf8")).toBe(
      before,
    );
    expect(readManifest(project)).not.toHaveProperty("testProject");
  });

  it("warns alongside the undeclared-harness failure too", async () => {
    const project = await gitProject();
    expect(await runInit(["--path", project, "--harness", "claude"])).toBe(0);

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "codex",
      "--test-project",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleLogs.some((m) => m.includes("--test-project had no effect")),
    ).toBe(true);
    expect(readManifest(project)).not.toHaveProperty("testProject");
  });

  it("stays quiet when the project already records the opt-in", async () => {
    const project = await gitProject();
    expect(
      await runInit([
        "--path",
        project,
        "--harness",
        "claude",
        "--test-project",
      ]),
    ).toBe(0);
    consoleLogs.length = 0;

    const exitCode = await runInit([
      "--path",
      project,
      "--harness",
      "claude",
      "--test-project",
    ]);

    expect(exitCode).toBe(0);
    expect(
      consoleLogs.some((m) => m.includes("--test-project had no effect")),
    ).toBe(false);
    expect(readManifest(project).testProject).toBe(true);
  });

  it("stays quiet when the flag was not given at all", async () => {
    const project = await gitProject();
    expect(await runInit(["--path", project, "--harness", "claude"])).toBe(0);
    consoleLogs.length = 0;

    const exitCode = await runInit(["--path", project, "--harness", "claude"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("--test-project"))).toBe(false);
  });
});
