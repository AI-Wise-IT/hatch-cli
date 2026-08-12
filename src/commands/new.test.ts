import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
}));
vi.mock("../registry/fetch.js", () => ({
  fetchRegistryFolder: vi.fn(),
}));
// Wraps the real simpleGit so every test exercises real git plumbing against
// a temp dir by default; only the rollback test below overrides it for one
// call to simulate a mid-operation failure.
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
const { runNew } = await import("./new.js");

let tempParent: string;
let consoleErrors: string[];

function skillFiles(version = "1.0.0"): Map<string, string> {
  return new Map([
    ["SKILL.md", "# Hatch Usage"],
    ["skill.json", `{"version":"${version}"}`],
  ]);
}

beforeEach(() => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-new-test-"));
  consoleErrors = [];
  vi.spyOn(console, "error").mockImplementation((msg: string) => {
    consoleErrors.push(msg);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});

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

describe("runNew — main flow", () => {
  it("creates the project, places the skill per harness, writes the manifest, and commits once", async () => {
    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude,codex",
    ]);

    expect(exitCode).toBe(0);
    const target = join(tempParent, "myproj");
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
      schemaVersion: 3,
      harnesses: ["claude", "codex"],
      skills: { "hatch-usage": { version: "1.0.0" } },
    });

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
  });

  it("does not re-prompt when a session already resolves", async () => {
    await runNew(["myproj", "--path", tempParent, "--harness", "claude"]);
    expect(promptHidden).not.toHaveBeenCalled();
    expect(validateGitHubToken).not.toHaveBeenCalled();
  });

  it("prompts and authenticates when no session exists yet, then persists it", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("fresh-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({ valid: true });

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(writeCredentials).toHaveBeenCalledWith("fresh-token");
    expect(fetchRegistryFolder).toHaveBeenCalledWith(
      "fresh-token",
      "hatch-usage",
    );
  });
});

describe("runNew — AF-1: invalid password", () => {
  it("aborts before creating anything when the token is rejected", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("bad-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "GitHub rejected the token as invalid or expired",
    });

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(tempParent, "myproj"))).toBe(false);
    expect(consoleErrors.some((m) => m.includes("invalid password"))).toBe(
      true,
    );
    expect(writeCredentials).not.toHaveBeenCalled();
  });
});

describe("runNew — AF-2: target path already occupied", () => {
  it("aborts before touching the existing folder", async () => {
    const target = join(tempParent, "myproj");
    mkdirSync(target);

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(target, ".git"))).toBe(false);
    expect(consoleErrors.some((m) => m.includes("already exists"))).toBe(true);
  });
});

describe("runNew — AF-3: invalid or unrecognized harness selection", () => {
  it("aborts before creating the folder or authenticating", async () => {
    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude,notreal",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(tempParent, "myproj"))).toBe(false);
    expect(consoleErrors.some((m) => m.includes("notreal"))).toBe(true);
    expect(resolveToken).not.toHaveBeenCalled();
  });
});

describe("runNew — AF-4: target location not writable", () => {
  it("aborts when the target location doesn't exist", async () => {
    const missingParent = join(tempParent, "does", "not", "exist");

    const exitCode = await runNew([
      "myproj",
      "--path",
      missingParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("does not exist"))).toBe(true);
  });
});

describe("runNew — AF-5: registry unreachable", () => {
  it("aborts before creating anything when the skill fetch is unreachable", async () => {
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(tempParent, "myproj"))).toBe(false);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
  });

  it("aborts when authentication itself can't reach the registry", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("some-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "could not reach GitHub (network down)",
    });

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(tempParent, "myproj"))).toBe(false);
    expect(consoleErrors.some((m) => m.includes("registry unreachable"))).toBe(
      true,
    );
  });
});

describe("runNew — rollback on partial failure", () => {
  it("removes everything already created if a later step throws", async () => {
    vi.mocked(fetchRegistryFolder).mockResolvedValue({
      ok: true,
      files: new Map([["skill.json", "not valid json but harmless"]]),
    });

    vi.mocked(simpleGit).mockImplementationOnce(
      () =>
        ({
          init: vi.fn().mockRejectedValue(new Error("simulated git failure")),
          add: vi.fn(),
          commit: vi.fn(),
          // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
        }) as any,
    );

    const exitCode = await runNew([
      "myproj",
      "--path",
      tempParent,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(existsSync(join(tempParent, "myproj"))).toBe(false);
  });
});
