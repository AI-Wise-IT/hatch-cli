import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckRepoActions, simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openVersionControl } from "./version-control.js";

let tempParent: string;
let consoleLogs: string[];

beforeEach(() => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-vc-test-"));

  consoleLogs = [];
  vi.spyOn(console, "log").mockImplementation((msg: string) => {
    consoleLogs.push(msg);
  });

  process.env.GIT_AUTHOR_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = "test@example.com";
  process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_COMMITTER_EMAIL = "test@example.com";
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempParent, { recursive: true, force: true });
});

function makeDir(...segments: string[]): string {
  const dir = join(tempParent, ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("openVersionControl — detection", () => {
  it("treats a project that is itself a repository root as version-controlled", async () => {
    const project = makeDir("repo-root");
    await simpleGit(project).init();

    const vc = await openVersionControl("hatch import", project);

    expect(vc.versionControlled).toBe(true);
    expect(consoleLogs).toEqual([]);
  });

  it("treats a project inside an enclosing repository's work tree as not version-controlled", async () => {
    const enclosing = makeDir("enclosing");
    await simpleGit(enclosing).init();
    const project = makeDir("enclosing", "packages", "myproj");
    // The case only means anything if the fixture really is inside the
    // enclosing repo's work tree while not being its root.
    expect(await simpleGit(project).checkIsRepo(CheckRepoActions.IN_TREE)).toBe(
      true,
    );

    const vc = await openVersionControl("hatch import", project);

    expect(vc.versionControlled).toBe(false);
    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      true,
    );
  });

  it("treats a project with no repository at or above it as not version-controlled", async () => {
    const project = makeDir("plain");
    expect(await simpleGit(project).checkIsRepo(CheckRepoActions.IN_TREE)).toBe(
      false,
    );

    const vc = await openVersionControl("hatch init", project);

    expect(vc.versionControlled).toBe(false);
    expect(consoleLogs.some((m) => m.includes("not a git repository"))).toBe(
      true,
    );
  });
});

describe("openVersionControl — commit", () => {
  it("records the whole effect as exactly one commit in a repository root", async () => {
    const project = makeDir("repo-root");
    await simpleGit(project).init();
    writeFileSync(join(project, "a.txt"), "a", "utf8");
    writeFileSync(join(project, "b.txt"), "b", "utf8");

    const vc = await openVersionControl("hatch import", project);
    await vc.commit("hatch import: add stuff");

    const log = await simpleGit(project).log();
    expect(log.total).toBe(1);
    expect(log.latest?.message).toBe("hatch import: add stuff");
    expect((await simpleGit(project).status()).isClean()).toBe(true);
  });

  it("makes no commit and does not throw when the project is not a repository", async () => {
    const project = makeDir("plain");
    writeFileSync(join(project, "a.txt"), "a", "utf8");

    const vc = await openVersionControl("hatch remove", project);
    await expect(
      vc.commit("hatch remove: drop stuff"),
    ).resolves.toBeUndefined();

    expect(
      await simpleGit(project).checkIsRepo(CheckRepoActions.IS_REPO_ROOT),
    ).toBe(false);
  });

  it("warns on every invocation, never suppressing after the first", async () => {
    const project = makeDir("plain");

    await openVersionControl("hatch import", project);
    await openVersionControl("hatch import", project);

    expect(
      consoleLogs.filter((m) => m.includes("not a git repository")),
    ).toHaveLength(2);
  });

  it("names the command and the project path in the warning", async () => {
    const project = makeDir("plain");

    await openVersionControl("hatch init", project);

    expect(consoleLogs[0]).toContain("hatch init");
    expect(consoleLogs[0]).toContain(project);
  });
});
