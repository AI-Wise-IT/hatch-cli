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

// Wraps the real simpleGit so tests exercise real git plumbing by default;
// only the rollback test overrides it to simulate a mid-operation failure.
vi.mock("simple-git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("simple-git")>();
  return { ...actual, simpleGit: vi.fn(actual.simpleGit) };
});

const { simpleGit } = await import("simple-git");
const { runRemove } = await import("./remove.js");

let tempParent: string;
let target: string;
let consoleErrors: string[];
let consoleLogs: string[];

function setStdinTTY(value: boolean) {
  Object.defineProperty(process.stdin, "isTTY", {
    value,
    configurable: true,
    writable: true,
  });
}

// Writes a skill's placed content under a harness's skills dir and returns
// the hash hatch import would have recorded for it (so tests can decide
// whether to match it — a clean fixture — or not — an edited/drifted one).
function placeSkill(
  harnessDir: string,
  name: string,
  files: Record<string, string>,
): string {
  const dir = join(target, harnessDir, "skills", name);
  mkdirSync(dir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(dir, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  return hashDiskTree(dir);
}

function writeManifest(
  skills: Record<string, unknown>,
  harnesses: string[] = ["claude"],
) {
  writeFileSync(
    join(target, "hatch.manifest.json"),
    JSON.stringify({ schemaVersion: 3, harnesses, skills }, null, 2),
    "utf8",
  );
}

async function commitAll(message: string) {
  const git = simpleGit(target);
  await git.add(".");
  await git.commit(message);
}

beforeEach(async () => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-remove-test-"));
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

  await simpleGit(target).init();
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempParent, { recursive: true, force: true });
});

describe("runRemove — main flow", () => {
  it("removes a standalone skill's placed content and manifest entry under every declared harness, one commit", async () => {
    const hash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    placeSkill(".codex", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    writeManifest({ "hatch-usage": { version: "1.0.0", contentHash: hash } }, [
      "claude",
      "codex",
    ]);
    await commitAll("seed");

    const exitCode = await runRemove(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "hatch-usage"))).toBe(
      false,
    );
    expect(existsSync(join(target, ".codex", "skills", "hatch-usage"))).toBe(
      false,
    );
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills).toEqual({});

    const log = await simpleGit(target).log();
    expect(log.total).toBe(2);
  });
});

describe("runRemove — AF-1: not imported", () => {
  it("no-ops when there is no manifest at all", async () => {
    const exitCode = await runRemove(["hatch-usage", "--path", target]);
    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("never imported"))).toBe(true);
  });

  it("no-ops when the manifest exists but never recorded this name", async () => {
    writeManifest({});
    await commitAll("seed");

    const exitCode = await runRemove(["never-imported", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("never imported"))).toBe(true);
  });

  it("re-running remove for an already-removed name is still a no-op", async () => {
    const hash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    writeManifest({ "hatch-usage": { version: "1.0.0", contentHash: hash } });
    await commitAll("seed");

    const first = await runRemove(["hatch-usage", "--path", target]);
    expect(first).toBe(0);

    const second = await runRemove(["hatch-usage", "--path", target]);
    expect(second).toBe(0);
    expect(consoleLogs.some((l) => l.includes("never imported"))).toBe(true);

    const log = await simpleGit(target).log();
    expect(log.total).toBe(2); // seed + first removal only
  });
});

describe("runRemove — AF-2: content missing on disk", () => {
  it("without a flag: aborts, reports the discrepancy, leaves the manifest entry in place", async () => {
    // Manifest records it, but nothing was ever placed on disk.
    writeManifest({
      "hatch-usage": { version: "1.0.0", contentHash: "deadbeef" },
    });
    await commitAll("seed");

    const exitCode = await runRemove(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("missing from disk"))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"]).toBeDefined();

    const log = await simpleGit(target).log();
    expect(log.total).toBe(1); // no new commit
  });

  it("--force-all drops the stale manifest entry despite the missing content", async () => {
    writeManifest({
      "hatch-usage": { version: "1.0.0", contentHash: "deadbeef" },
    });
    await commitAll("seed");

    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--force-all",
    ]);

    expect(exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills).toEqual({});
  });
});

describe("runRemove — AF-3: local edits present", () => {
  it("without a flag: aborts, reports the edit, leaves content and manifest untouched", async () => {
    placeSkill(".claude", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    // Wrong stored hash simulates a hand-edit since import.
    writeManifest({
      "hatch-usage": { version: "1.0.0", contentHash: "not-the-real-hash" },
    });
    await commitAll("seed");

    const exitCode = await runRemove(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(0);
    expect(consoleLogs.some((l) => l.includes("local edits"))).toBe(true);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"]).toBeDefined();
  });

  it("--force-all removes it anyway", async () => {
    placeSkill(".claude", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    writeManifest({
      "hatch-usage": { version: "1.0.0", contentHash: "not-the-real-hash" },
    });
    await commitAll("seed");

    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--force-all",
    ]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "hatch-usage"))).toBe(
      false,
    );
  });

  it("--force-clean on a standalone target removes nothing, since the only item is the dirty one", async () => {
    placeSkill(".claude", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    writeManifest({
      "hatch-usage": { version: "1.0.0", contentHash: "not-the-real-hash" },
    });
    await commitAll("seed");

    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--force-clean",
    ]);

    expect(exitCode).toBe(0);
    expect(
      existsSync(join(target, ".claude", "skills", "hatch-usage", "SKILL.md")),
    ).toBe(true);
    expect(consoleLogs.some((l) => l.includes("nothing removed"))).toBe(true);
  });
});

describe("runRemove — AF-4: target belongs to a group", () => {
  it("refuses to remove a group member individually, naming the group instead", async () => {
    const hashA = placeSkill(".claude", "a", { "SKILL.md": "# A" });
    placeSkill(".claude", "b", { "SKILL.md": "# B" });
    writeManifest({
      a: { version: "1.0.0", group: "my-group", contentHash: hashA },
      b: { version: "1.0.0", group: "my-group", contentHash: "irrelevant" },
      "my-group": { version: "1.0.0" },
    });
    await commitAll("seed");

    const exitCode = await runRemove(["a", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((l) => l.includes('belongs to group "my-group"')),
    ).toBe(true);
    expect(existsSync(join(target, ".claude", "skills", "a", "SKILL.md"))).toBe(
      true,
    );
  });
});

describe("runRemove — group removal", () => {
  it("main flow: removes every clean member and the group's own entry, one commit", async () => {
    const hashA = placeSkill(".claude", "a", { "SKILL.md": "# A" });
    const hashB = placeSkill(".claude", "b", { "SKILL.md": "# B" });
    writeManifest({
      a: { version: "1.0.0", group: "my-group", contentHash: hashA },
      b: { version: "1.0.0", group: "my-group", contentHash: hashB },
      "my-group": { version: "1.0.0" },
    });
    await commitAll("seed");

    const exitCode = await runRemove(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "a"))).toBe(false);
    expect(existsSync(join(target, ".claude", "skills", "b"))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills).toEqual({});
  });

  it("without a flag: one dirty member blocks the whole group, nothing removed", async () => {
    const hashA = placeSkill(".claude", "a", { "SKILL.md": "# A" });
    placeSkill(".claude", "b", { "SKILL.md": "# B" });
    writeManifest({
      a: { version: "1.0.0", group: "my-group", contentHash: hashA },
      b: { version: "1.0.0", group: "my-group", contentHash: "wrong-hash" },
      "my-group": { version: "1.0.0" },
    });
    await commitAll("seed");

    const exitCode = await runRemove(["my-group", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "a"))).toBe(true);
    expect(existsSync(join(target, ".claude", "skills", "b"))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills.a).toBeDefined();
    expect(manifest.skills.b).toBeDefined();
    expect(manifest.skills["my-group"]).toBeDefined();
  });

  it("--force-clean removes only the clean member, keeps the dirty one and the group's own entry", async () => {
    const hashA = placeSkill(".claude", "a", { "SKILL.md": "# A" });
    placeSkill(".claude", "b", { "SKILL.md": "# B" });
    writeManifest({
      a: { version: "1.0.0", group: "my-group", contentHash: hashA },
      b: { version: "1.0.0", group: "my-group", contentHash: "wrong-hash" },
      "my-group": { version: "1.0.0" },
    });
    await commitAll("seed");

    const exitCode = await runRemove([
      "my-group",
      "--path",
      target,
      "--force-clean",
    ]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "a"))).toBe(false);
    expect(existsSync(join(target, ".claude", "skills", "b"))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills.a).toBeUndefined();
    expect(manifest.skills.b).toBeDefined();
    // Kept: not every member was removed, so the group entry stays too.
    expect(manifest.skills["my-group"]).toBeDefined();
  });

  it("--force-all removes every member including the dirty one, and drops the group's own entry", async () => {
    const hashA = placeSkill(".claude", "a", { "SKILL.md": "# A" });
    placeSkill(".claude", "b", { "SKILL.md": "# B" });
    writeManifest({
      a: { version: "1.0.0", group: "my-group", contentHash: hashA },
      b: { version: "1.0.0", group: "my-group", contentHash: "wrong-hash" },
      "my-group": { version: "1.0.0" },
    });
    await commitAll("seed");

    const exitCode = await runRemove([
      "my-group",
      "--path",
      target,
      "--force-all",
    ]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".claude", "skills", "a"))).toBe(false);
    expect(existsSync(join(target, ".claude", "skills", "b"))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills).toEqual({});
  });
});

describe("runRemove — AF-5: drop a harness", () => {
  it("removes the harness's placed content for every standalone skill and group member, drops it from the manifest, one commit — leaving other harnesses untouched", async () => {
    const claudeHash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    placeSkill(".codex", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    placeSkill(".claude", "design-architecture-decision", {
      "SKILL.md": "# A",
    });
    placeSkill(".codex", "design-architecture-decision", { "SKILL.md": "# A" });
    writeManifest(
      {
        "hatch-usage": { version: "1.0.0", contentHash: claudeHash },
        "design-architecture-decision": {
          version: "1.0.0",
          group: "architecture-decisions",
          contentHash: hashDiskTree(
            join(target, ".claude", "skills", "design-architecture-decision"),
          ),
        },
        "architecture-decisions": { version: "1.0.0" },
      },
      ["claude", "codex"],
    );
    await commitAll("seed");

    const exitCode = await runRemove(["--harness", "codex", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".codex", "skills", "hatch-usage"))).toBe(
      false,
    );
    expect(
      existsSync(
        join(target, ".codex", "skills", "design-architecture-decision"),
      ),
    ).toBe(false);
    expect(existsSync(join(target, ".claude", "skills", "hatch-usage"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(target, ".claude", "skills", "design-architecture-decision"),
      ),
    ).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.harnesses).toEqual(["claude"]);
    // Content untouched — dropping a harness never touches the manifest's
    // skills entries, only the harnesses array (0023).
    expect(Object.keys(manifest.skills).sort()).toEqual([
      "architecture-decisions",
      "design-architecture-decision",
      "hatch-usage",
    ]);

    const log = await simpleGit(target).log();
    expect(log.total).toBe(2);
    expect(log.latest?.message).toContain('drop harness "codex"');
  });

  it("removes the harness's content unconditionally, even when it has local edits — no flag needed, per 0023", async () => {
    const hash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    placeSkill(".codex", "hatch-usage", { "SKILL.md": "# Hatch Usage" });
    writeManifest({ "hatch-usage": { version: "1.0.0", contentHash: hash } }, [
      "claude",
      "codex",
    ]);
    await commitAll("seed");

    // Hand-edit the codex-side content — hatch remove --harness must not
    // care, since AF-5 has no drift/local-edit gating at all.
    writeFileSync(
      join(target, ".codex", "skills", "hatch-usage", "SKILL.md"),
      "# Hand-edited",
      "utf8",
    );

    const exitCode = await runRemove(["--harness", "codex", "--path", target]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(target, ".codex", "skills", "hatch-usage"))).toBe(
      false,
    );
  });

  it("refuses to drop the project's only declared harness", async () => {
    const hash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    writeManifest({ "hatch-usage": { version: "1.0.0", contentHash: hash } }, [
      "claude",
    ]);
    await commitAll("seed");

    const exitCode = await runRemove(["--harness", "claude", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((l) =>
        l.includes("must always declare at least one harness"),
      ),
    ).toBe(true);
    expect(existsSync(join(target, ".claude", "skills", "hatch-usage"))).toBe(
      true,
    );
    const log = await simpleGit(target).log();
    expect(log.total).toBe(1);
  });

  it("no-ops when the named harness isn't declared in this project", async () => {
    writeManifest({}, ["claude"]);
    await commitAll("seed");

    const exitCode = await runRemove(["--harness", "codex", "--path", target]);

    expect(exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.harnesses).toEqual(["claude"]);
  });

  it("no-ops when there is no manifest at all", async () => {
    const exitCode = await runRemove(["--harness", "claude", "--path", target]);
    expect(exitCode).toBe(0);
  });

  it("rejects an unrecognized harness code", async () => {
    writeManifest({}, ["claude"]);
    await commitAll("seed");

    const exitCode = await runRemove(["--harness", "bogus", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((l) => l.includes('unrecognized harness "bogus"')),
    ).toBe(true);
  });

  it("recomputes contentHash against the new primary harness when dropping the old primary, so a later local-edit check isn't misled", async () => {
    // claude sorts before codex, so claude starts primary. Give it content
    // that differs from codex's own placed content (as harness-suffix
    // resolution legitimately can produce) — hatch-usage's manifest
    // contentHash is recorded from claude's (primary) content.
    const claudeHash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Claude variant",
    });
    placeSkill(".codex", "hatch-usage", { "SKILL.md": "# Codex variant" });
    writeManifest(
      { "hatch-usage": { version: "1.0.0", contentHash: claudeHash } },
      ["claude", "codex"],
    );
    await commitAll("seed");

    // Drop claude (the old primary) — codex becomes the new primary. Its
    // own on-disk content ("# Codex variant") was never hashed before.
    const dropExit = await runRemove(["--harness", "claude", "--path", target]);
    expect(dropExit).toBe(0);

    // A later remove of hatch-usage must see it as clean (not falsely
    // "edited") — the hash must have been recomputed against codex's own
    // untouched content, not left pointing at claude's now-deleted content.
    const removeExit = await runRemove(["hatch-usage", "--path", target]);
    expect(removeExit).toBe(0);
    expect(consoleLogs.some((l) => l.includes("has local edits"))).toBe(false);
    expect(existsSync(join(target, ".codex", "skills", "hatch-usage"))).toBe(
      false,
    );
  });
});

describe("runRemove — argument handling", () => {
  it("rejects combining --force-all and --force-clean", async () => {
    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--force-all",
      "--force-clean",
    ]);
    expect(exitCode).toBe(1);
    expect(consoleErrors.some((l) => l.includes("cannot be combined"))).toBe(
      true,
    );
  });

  it("rejects a missing target name", async () => {
    const exitCode = await runRemove(["--path", target]);
    expect(exitCode).toBe(1);
  });

  it("rejects an unrecognized option", async () => {
    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--bogus",
    ]);
    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((l) => l.includes('unrecognized option "--bogus"')),
    ).toBe(true);
  });

  it("rejects combining --harness with a skill/group name", async () => {
    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      target,
      "--harness",
      "claude",
    ]);
    expect(exitCode).toBe(1);
    expect(consoleErrors.some((l) => l.includes("cannot be combined"))).toBe(
      true,
    );
  });

  it("rejects combining --harness with --force-all", async () => {
    const exitCode = await runRemove([
      "--path",
      target,
      "--harness",
      "claude",
      "--force-all",
    ]);
    expect(exitCode).toBe(1);
    expect(consoleErrors.some((l) => l.includes("cannot be combined"))).toBe(
      true,
    );
  });

  it("rejects a target project path that doesn't exist", async () => {
    const exitCode = await runRemove([
      "hatch-usage",
      "--path",
      join(tempParent, "does-not-exist"),
    ]);
    expect(exitCode).toBe(1);
  });
});

describe("runRemove — rollback on partial failure", () => {
  it("restores deleted content and the manifest if the commit fails", async () => {
    const hash = placeSkill(".claude", "hatch-usage", {
      "SKILL.md": "# Hatch Usage",
    });
    writeManifest({ "hatch-usage": { version: "1.0.0", contentHash: hash } });
    await commitAll("seed");

    const realGit = simpleGit(target);
    vi.mocked(simpleGit).mockImplementationOnce(
      () =>
        ({
          add: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockRejectedValue(new Error("simulated git failure")),
          reset: realGit.reset.bind(realGit),
          // biome-ignore lint/suspicious/noExplicitAny: minimal stub of simple-git's SimpleGit surface
        }) as any,
    );

    const exitCode = await runRemove(["hatch-usage", "--path", target]);

    expect(exitCode).toBe(1);
    expect(
      readFileSync(
        join(target, ".claude", "skills", "hatch-usage", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# Hatch Usage");
    const manifest = JSON.parse(
      readFileSync(join(target, "hatch.manifest.json"), "utf8"),
    );
    expect(manifest.skills["hatch-usage"]).toBeDefined();
  });
});
