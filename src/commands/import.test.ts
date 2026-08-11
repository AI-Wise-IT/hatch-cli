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
  fetchRegistryFolder: vi.fn(),
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
const { fetchRegistryFolder, registryFolderExists } = await import(
  "../registry/fetch.js"
);
const { simpleGit } = await import("simple-git");
const { runImport } = await import("./import.js");

let tempParent: string;
let target: string;
let consoleErrors: string[];
let consoleLogs: string[];

function skillFiles(version = "1.0.0"): Map<string, string> {
  return new Map([
    ["SKILL.md", "# Hatch Usage"],
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

beforeEach(() => {
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
      exists: name === "hatch-usage",
    }));
  vi.mocked(fetchRegistryFolder).mockReset().mockResolvedValue({
    ok: true,
    files: skillFiles(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempParent, { recursive: true, force: true });
});

describe("runImport — main flow", () => {
  it("auto-inits git, places the skill per harness, writes the manifest, and commits once", async () => {
    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude,codex",
    ]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".git"))).toBe(true);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Hatch Usage");
    expect(
      readFileSync(
        join(target, ".codex", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Hatch Usage");

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest).toEqual({
      schemaVersion: 1,
      harnesses: ["claude", "codex"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
  });

  it("does not require --harness and ignores it when a manifest already exists", async () => {
    writeFileSync(
      join(target, "hatch.manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        harnesses: ["claude"],
        skills: {},
      }),
      "utf8",
    );

    const exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(true);
    expect(existsSync(join(target, ".codex"))).toBe(false);
  });

  it("resolves the harness-suffixed variant over the plain default, deploying under the plain name", async () => {
    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, name) => ({
        ok: true,
        exists: name === "hatch-usage-cld" || name === "hatch-usage",
      }),
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, folderName) => {
        if (folderName === "hatch-usage-cld") {
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

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "existing-session-token",
      "hatch-usage-cld",
    );
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Claude variant");
  });
});

describe("runImport — manifest bootstrap (0015-import-harness-selection-flag)", () => {
  it("requires --harness before authenticating when no manifest exists yet", async () => {
    const exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("--harness"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(false);
    expect(resolveToken).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized harness before authenticating", async () => {
    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude,notreal",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("notreal"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(false);
    expect(resolveToken).not.toHaveBeenCalled();
  });
});

describe("runImport — skill not found for a declared harness", () => {
  it("aborts cleanly when neither suffixed nor plain variant exists for a harness", async () => {
    vi.mocked(registryFolderExists).mockResolvedValue({
      ok: true,
      exists: false,
    });

    const exitCode = await runImport([
      "nonexistent-skill",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((m) => m.includes("was not found in the registry")),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });
});

describe("runImport — AF-6: destination occupied", () => {
  function preOccupyDestination() {
    const destDir = join(target, ".claude", "skills", "hatch-usage");
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "SKILL.md"), "not placed by hatch", "utf8");
  }

  it("defaults to skipping the conflicting file when unattended, and still completes", async () => {
    preOccupyDestination();
    setStdinTTY(false);

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(promptLine).not.toHaveBeenCalled();
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
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

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(promptLine).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("not placed by hatch");
  });

  it("places the content alongside with a suffix interactively when the developer chooses suffix", async () => {
    preOccupyDestination();
    setStdinTTY(true);
    vi.mocked(promptLine).mockResolvedValue("suffix");

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("not placed by hatch");
    expect(
      readFileSync(
        join(
          target,
          ".claude",
          "skills",
          "hatch-usage",
          "SKILL.hatch-import.md",
        ),
        "utf8",
      ),
    ).toBe("# Hatch Usage");
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

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
  });

  it("aborts when the fetch step can't reach the registry", async () => {
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
  });

  it("aborts when authentication itself can't reach the registry", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("some-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "could not reach GitHub (network down)",
    });

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
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

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("invalid password"))).toBe(
      true,
    );
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
    expect(writeCredentials).not.toHaveBeenCalled();
    expect(fetchRegistryFolder).not.toHaveBeenCalled();
  });
});

describe("runImport — rollback on partial failure", () => {
  it("removes placed files and the newly-created manifest if the commit fails, leaving the project directory intact", async () => {
    vi.mocked(simpleGit).mockImplementationOnce(
      () =>
        ({
          checkIsRepo: vi.fn().mockResolvedValue(false),
          init: vi.fn().mockResolvedValue(undefined),
          add: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockRejectedValue(new Error("simulated git failure")),
          // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
        }) as any,
    );

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(target)).toBe(true);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(false);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
  });
});
