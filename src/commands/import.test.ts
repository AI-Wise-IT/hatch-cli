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
  fetchRegistryFile: vi.fn(),
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
const { fetchRegistryFile, fetchRegistryFolder, registryFolderExists } =
  await import("../registry/fetch.js");
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
  // Default: the classification lookup (does <name>/skill.json exist and
  // does it have "members"?) finds nothing, so every existing standalone
  // test's target is treated as a plain skill, same as before groups
  // existed.
  vi.mocked(fetchRegistryFile).mockReset().mockResolvedValue({
    ok: false,
    reason: "not-found",
    detail: "not found",
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
      schemaVersion: 3,
      harnesses: ["claude", "codex"],
      skills: {
        "hatch-usage": { version: "1.0.0", contentHash: expect.any(String) },
      },
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
      undefined,
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

    const exitCode = await runImport([
      "my-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

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
      schemaVersion: 3,
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
            { kind: "pointer", name: "prd-elicitation" },
            { kind: "pointer", name: "sub-group" },
          ]),
        };
      }
      if (path === "prd-elicitation/skill.json") {
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
                { kind: "pointer", name: "prd-elicitation" },
                { kind: "pointer", name: "sub-group" },
              ]),
            ],
          ]),
        };
      }
      if (name === "prd-elicitation") {
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

    const exitCode = await runImport([
      "combo-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "prd-elicitation", "SKILL.md"),
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
      "prd-elicitation": {
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
      "prd-elicitation",
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

    const exitCode = await runImport([
      "conflict-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

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

    const exitCode = await runImport([
      "abort-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) =>
          m.includes("shared") && m.includes("1.9.0") && m.includes("2.0.0"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
    expect(existsSync(join(target, ".claude", "skills", "shared"))).toBe(false);
  });
});

// Batch 7: re-import & staleness (AF-1..AF-4) + standalone version pinning
// (AF-10..AF-12, rescope-0001-standalone-version-pinning.md).

function mockStandaloneSkill(getVersion: () => string) {
  vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
    if (path === "hatch-usage/skill.json") {
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
    await runImport(["hatch-usage", "--path", target, "--harness", "claude"]);
    const manifestBefore = readFileSync(
      join(target, "hatch.manifest.json"),
      "utf8",
    );
    const logBefore = await simpleGit(target).log();

    consoleLogs.length = 0;
    const exitCode = await runImport(["hatch-usage", "--path", target]);

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
    await runImport(["hatch-usage", "--path", target, "--harness", "claude"]);
    const logBefore = await simpleGit(target).log();

    version = "1.1.0";
    consoleLogs.length = 0;
    const exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("v1.0.0 → v1.1.0"))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].version).toBe("1.1.0");
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total + 1);
  });
});

describe("runImport — AF-3: re-import, local edits present", () => {
  it("leaves locally-edited content untouched and reports local edits, even with a newer version available", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);
    await runImport(["hatch-usage", "--path", target, "--harness", "claude"]);
    const skillFile = join(
      target,
      ".claude",
      "skills",
      "hatch-usage",
      "SKILL.md",
    );
    writeFileSync(skillFile, "edited locally by the developer", "utf8");
    const logBefore = await simpleGit(target).log();

    version = "1.1.0";
    consoleLogs.length = 0;
    const exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("local edits"))).toBe(true);
    expect(readFileSync(skillFile, "utf8")).toBe(
      "edited locally by the developer",
    );
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].version).toBe("1.0.0");
    const logAfter = await simpleGit(target).log();
    expect(logAfter.total).toBe(logBefore.total);
  });
});

describe("runImport — AF-4: deprecated/removed skill detected", () => {
  it("surfaces a removed-flag warning for a previously-imported skill without blocking this run's primary operation", async () => {
    mockStandaloneSkill(() => "1.0.0");
    await runImport(["hatch-usage", "--path", target, "--harness", "claude"]);

    vi.mocked(registryFolderExists).mockImplementation(
      async (_token, folderName) => ({
        ok: true,
        exists: folderName === "hatch-usage" || folderName === "other-skill",
      }),
    );
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "hatch-usage/skill.json") {
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
    const exitCode = await runImport([
      "other-skill",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(
      consoleLogs.some(
        (m) => m.includes("hatch-usage") && m.includes("removed"),
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
        if (path === "hatch-usage/skill.json") {
          return {
            ok: true,
            content: plainSkillJson(
              ref === "hatch-usage@1.0.0" ? "1.0.0" : "2.0.0",
            ),
          };
        }
        return { ok: false, reason: "not-found", detail: "not found" };
      },
    );
    vi.mocked(fetchRegistryFolder).mockImplementation(
      async (_token, _folderName, ref) => {
        expect(ref).toBe("hatch-usage@1.0.0");
        return { ok: true, files: skillFiles("1.0.0") };
      },
    );

    const exitCode = await runImport([
      "hatch-usage@1.0.0",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"]).toEqual({
      version: "1.0.0",
      contentHash: expect.any(String),
      pin: { type: "exact", value: "1.0.0" },
    });
  });

  it("AF-10: a bare re-import of a standing exact pin skips the update check entirely and leaves it untouched", async () => {
    mockStandaloneSkill(() => "1.0.0");
    await runImport([
      "hatch-usage@1.0.0",
      "--path",
      target,
      "--harness",
      "claude",
    ]);
    const manifestBefore = readFileSync(
      join(target, "hatch.manifest.json"),
      "utf8",
    );
    const logBefore = await simpleGit(target).log();

    vi.mocked(fetchRegistryFolder).mockClear();
    consoleLogs.length = 0;
    const exitCode = await runImport(["hatch-usage", "--path", target]);

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

    let exitCode = await runImport([
      "hatch-usage@^1.0.0",
      "--path",
      target,
      "--harness",
      "claude",
    ]);
    expect(exitCode).toBe(0);
    let manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].pin).toEqual({
      type: "range",
      value: "1.0.0",
    });

    version = "1.1.0";
    consoleLogs.length = 0;
    exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((m) => m.includes("v1.0.0 → v1.1.0"))).toBe(true);
    manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].version).toBe("1.1.0");
    expect(manifest.skills["hatch-usage"].pin).toEqual({
      type: "range",
      value: "1.0.0",
    });
  });

  it("clears a standing exact pin via @latest, and a later bare re-import keeps auto-updating", async () => {
    let version = "1.0.0";
    mockStandaloneSkill(() => version);

    await runImport([
      "hatch-usage@1.0.0",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    version = "1.1.0";
    let exitCode = await runImport(["hatch-usage@latest", "--path", target]);
    expect(exitCode).toBe(0);
    let manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].pin).toBeUndefined();
    expect(manifest.skills["hatch-usage"].version).toBe("1.1.0");

    version = "1.2.0";
    exitCode = await runImport(["hatch-usage", "--path", target]);
    expect(exitCode).toBe(0);
    manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"].version).toBe("1.2.0");
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

    await runImport(["my-group", "--path", target, "--harness", "claude"]);
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

    await runImport(["my-group", "--path", target, "--harness", "claude"]);
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
        ["SKILL.md", "# Hatch Usage"],
        ["skill.json", '{"version":"1.0.0"}'],
        ["NOTE.md", "fixture authoring notes, never deployed"],
      ]),
    });

    const exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "NOTE.md")),
    ).toBe(false);
    expect(
      existsSync(
        join(target, ".claude", "skills", "hatch-usage", "skill.json"),
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

    const exitCode = await runImport([
      "gone-skill",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("gone-skill") && m.includes("removed"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
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

    const exitCode = await runImport([
      "gone-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some(
        (m) => m.includes("gone-group") && m.includes("removed"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, "hatch.manifest.json"))).toBe(false);
  });

  it("does not block a re-import of something already in the manifest that later became removed (AF-4 still applies, warn-only)", async () => {
    let removed = false;
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path === "hatch-usage/skill.json") {
        return {
          ok: true,
          content: JSON.stringify({ version: "1.0.0", removed }),
        };
      }
      return { ok: false, reason: "not-found", detail: "not found" };
    });

    let exitCode = await runImport([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);
    expect(exitCode).toBe(0);

    removed = true;
    consoleLogs.length = 0;
    exitCode = await runImport(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0); // AF-1/AF-4, not AF-13 — already imported
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
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

    const exitCode = await runImport([
      "fine-group",
      "--path",
      target,
      "--harness",
      "claude",
    ]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(
        join(target, ".claude", "skills", "removed-member", "SKILL.md"),
      ),
    ).toBe(true);
  });
});
