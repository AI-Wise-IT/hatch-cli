import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryRootEntry } from "../registry/fetch.js";

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
// `runList` reaches the network only through these two, so mocking the
// module covers every registry read the command can make.
vi.mock("../registry/fetch.js", () => ({
  fetchRegistryFile: vi.fn(),
  fetchRegistryFolder: vi.fn(),
  listRegistryRoot: vi.fn(),
  registryFolderExists: vi.fn(),
}));

const { resolveToken, writeCredentials } = await import(
  "../auth/credentials.js"
);
const { validateGitHubToken } = await import("../auth/github-token.js");
const { promptHidden } = await import("../cli/prompt.js");
const { fetchRegistryFile, listRegistryRoot } = await import(
  "../registry/fetch.js"
);
const { simpleGit } = await import("simple-git");
const {
  filterCandidateNames,
  foldCandidateNames,
  mapWithConcurrency,
  parseListArgs,
  renderListing,
  runList,
} = await import("./list.js");

// The reserved harness codes, injected wherever a fold is asserted so the
// rule stays decidable without the harness registry file.
const CODES = ["cld", "cdx", "csr"];

let tempParent: string;
let target: string;
let consoleErrors: string[];
let consoleLogs: string[];

// ---------------------------------------------------------------------------
// A fake registry: what each top-level folder holds, keyed by folder name.

interface FakeFolder {
  // Omitted means the folder has no skill.json at all — a docs or workflow
  // directory sitting beside the skills.
  skillJson?: Record<string, unknown> | string;
  skillMd?: string;
  // Anything else the folder holds, keyed by path below the folder. Present
  // only so a test can prove these are never fetched.
  extraFiles?: Record<string, string>;
  // Simulates a folder whose metadata cannot be read at all.
  unreachable?: boolean;
}

function dirEntries(...names: string[]): RegistryRootEntry[] {
  return names.map((name) => ({ name, type: "dir" }));
}

function mockRoot(...names: string[]) {
  vi.mocked(listRegistryRoot).mockResolvedValue({
    ok: true,
    entries: dirEntries(...names),
  });
}

// Wires both the root listing and the per-file reads to one folder map.
// `rootOrder` lets a test hand the command a deliberately unsorted root.
function mockRegistry(
  folders: Record<string, FakeFolder>,
  rootOrder: string[] = Object.keys(folders),
) {
  mockRoot(...rootOrder);
  vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
    const slash = path.indexOf("/");
    const name = slash === -1 ? path : path.slice(0, slash);
    const rest = slash === -1 ? "" : path.slice(slash + 1);
    const folder = folders[name];

    if (folder?.unreachable) {
      return {
        ok: false,
        reason: "unreachable",
        detail: "could not reach the registry (network down)",
      };
    }
    if (folder) {
      if (rest === "skill.json" && folder.skillJson !== undefined) {
        return {
          ok: true,
          content:
            typeof folder.skillJson === "string"
              ? folder.skillJson
              : JSON.stringify(folder.skillJson),
        };
      }
      if (rest === "SKILL.md" && folder.skillMd !== undefined) {
        return { ok: true, content: folder.skillMd };
      }
      const extra = folder.extraFiles?.[rest];
      if (extra !== undefined) {
        return { ok: true, content: extra };
      }
    }
    return {
      ok: false,
      reason: "not-found",
      detail: `"${path}" was not found in the registry`,
    };
  });
}

// A SKILL.md whose frontmatter declares the given description.
function skillMd(description: string): string {
  return `---\nname: a-skill\ndescription: ${description}\n---\n\n# Body\n`;
}

function fetchedPaths(): string[] {
  return vi.mocked(fetchRegistryFile).mock.calls.map((call) => call[1]);
}

// A rendered row splits on its column padding into name, kind, version and
// description — descriptions are collapsed to single spaces, so nothing else
// in a row contains a run of two spaces.
function rows(): string[][] {
  return consoleLogs.map((line) => line.split(/\s{2,}/));
}

function listedNames(): string[] {
  return rows().map((row) => row[0]);
}

// The manifest `hatch init` would have written. Returned raw so a test can
// assert byte-for-byte that `hatch list` left it alone.
function seedManifest(extra: Record<string, unknown> = {}): string {
  const raw = `${JSON.stringify({ schemaVersion: 4, harnesses: ["claude"], ...extra, skills: {} }, null, 2)}\n`;
  writeFileSync(join(target, "hatch.manifest.json"), raw, "utf8");
  return raw;
}

beforeEach(() => {
  tempParent = mkdtempSync(join(tmpdir(), "hatch-list-test-"));
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
  // `hatch list` takes no --path: the directory it runs in is the project
  // whose opt-in it reads.
  vi.spyOn(process, "cwd").mockImplementation(() => target);

  process.env.GIT_AUTHOR_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = "test@example.com";
  process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_COMMITTER_EMAIL = "test@example.com";

  vi.mocked(resolveToken).mockReset().mockReturnValue("existing-session-token");
  vi.mocked(writeCredentials).mockReset();
  vi.mocked(validateGitHubToken).mockReset();
  vi.mocked(promptHidden).mockReset();
  vi.mocked(listRegistryRoot)
    .mockReset()
    .mockResolvedValue({ ok: true, entries: [] });
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

// ---------------------------------------------------------------------------
// 2.1 — one optional filter argument.

describe("parseListArgs — an optional single filter (2.1)", () => {
  it("reads no argument as no filter", () => {
    expect(parseListArgs([])).toEqual({ filter: undefined });
  });

  it("reads one argument as the filter", () => {
    expect(parseListArgs(["prd-elicit"])).toEqual({ filter: "prd-elicit" });
  });

  it("rejects a second positional argument, naming it", () => {
    expect(parseListArgs(["prd", "extra"])).toEqual({
      error: 'unexpected extra argument "extra"',
    });
  });

  it("rejects an unrecognized option", () => {
    expect(parseListArgs(["--all"])).toEqual({
      error: 'unrecognized option "--all"',
    });
  });
});

describe("runList — argument errors (2.1)", () => {
  it("prints usage and exits non-zero on a second positional argument, reading nothing", async () => {
    const exitCode = await runList(["prd", "extra"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain(
      'hatch list: unexpected extra argument "extra"',
    );
    expect(consoleErrors).toContain("usage: hatch list [filter]");
    expect(listRegistryRoot).not.toHaveBeenCalled();
    expect(fetchRegistryFile).not.toHaveBeenCalled();
  });

  it("prints usage and exits non-zero on an unrecognized option", async () => {
    const exitCode = await runList(["--all"]);

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain('hatch list: unrecognized option "--all"');
    expect(consoleErrors).toContain("usage: hatch list [filter]");
    expect(listRegistryRoot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2.2 — authentication before any registry read.

describe("runList — authentication (2.2)", () => {
  it("lists with an already-present session, without prompting", async () => {
    mockRegistry({
      "example-pointer-skill": {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Runs a PRD conversation."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(promptHidden).not.toHaveBeenCalled();
    expect(listRegistryRoot).toHaveBeenCalledWith("existing-session-token");
    expect(listedNames()).toEqual(["example-pointer-skill"]);
  });

  it("authenticates before reading the registry when no session is present", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("fresh-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({ valid: true });
    mockRegistry({
      "example-pointer-skill": {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Runs a PRD conversation."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(promptHidden).toHaveBeenCalledTimes(1);
    expect(writeCredentials).toHaveBeenCalledWith("fresh-token");
    expect(listRegistryRoot).toHaveBeenCalledWith("fresh-token");
    expect(listedNames()).toEqual(["example-pointer-skill"]);
  });

  it("aborts on an invalid password before any registry read", async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined);
    vi.mocked(promptHidden).mockResolvedValue("bad-token");
    vi.mocked(validateGitHubToken).mockResolvedValue({
      valid: false,
      reason: "GitHub rejected the token as invalid or expired",
    });
    mockRegistry({
      "example-pointer-skill": { skillJson: { version: "1.0.0" } },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    expect(consoleErrors.some((m) => m.includes("invalid password"))).toBe(
      true,
    );
    expect(writeCredentials).not.toHaveBeenCalled();
    expect(listRegistryRoot).not.toHaveBeenCalled();
    expect(fetchRegistryFile).not.toHaveBeenCalled();
    expect(consoleLogs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2.3 — the test-project opt-in, read from the directory the command runs in.

describe("runList — the test-project opt-in (2.3)", () => {
  function seedTwoEntryRegistry() {
    mockRegistry({
      "example-pointer-skill": {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Runs a PRD conversation."),
      },
      "_harness-suffix-fixture": {
        skillJson: { version: "2.0.0", testing: true },
        skillMd: skillMd("A fixture."),
      },
    });
  }

  it("hides testing content from an initialized ordinary project, saying nothing about it", async () => {
    seedManifest();
    seedTwoEntryRegistry();

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["example-pointer-skill"]);
    const output = [...consoleLogs, ...consoleErrors].join("\n");
    expect(output).not.toContain("_harness-suffix-fixture");
    expect(output).not.toContain("withheld");
    expect(output).not.toContain("hidden");
    expect(output).not.toContain("testProject");
  });

  it("lists testing content alongside ordinary content for a project recording testProject: true", async () => {
    seedManifest({ testProject: true });
    seedTwoEntryRegistry();

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual([
      "_harness-suffix-fixture",
      "example-pointer-skill",
    ]);
    // Shown with the same four fields as any other entry.
    expect(rows()[0]).toEqual([
      "_harness-suffix-fixture",
      "skill",
      "v2.0.0",
      "A fixture.",
    ]);
  });

  it("runs from a directory with no manifest, reporting no missing manifest and never naming `hatch init`", async () => {
    seedTwoEntryRegistry();

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(consoleErrors).toEqual([]);
    const output = [...consoleLogs, ...consoleErrors].join("\n");
    expect(output).not.toContain("hatch init");
    expect(output).not.toContain("manifest");
    // Read as a project without the opt-in would see the registry.
    expect(listedNames()).toEqual(["example-pointer-skill"]);
  });

  it("treats an unreadable manifest as an ordinary project rather than an error", async () => {
    writeFileSync(join(target, "hatch.manifest.json"), "{not json", "utf8");
    seedTwoEntryRegistry();

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(consoleErrors).toEqual([]);
    expect(listedNames()).toEqual(["example-pointer-skill"]);
  });
});

// ---------------------------------------------------------------------------
// 2.4 — folding the root listing into candidate names.

describe("foldCandidateNames — harness variants fold into the family name (2.4)", () => {
  it("folds a family with a harness variant into the plain name", () => {
    expect(
      foldCandidateNames(dirEntries("handover", "handover-cld"), CODES),
    ).toEqual(["handover"]);
  });

  it("folds a family with several variants into the one plain name", () => {
    expect(
      foldCandidateNames(
        dirEntries("handover", "handover-cld", "handover-cdx", "handover-csr"),
        CODES,
      ),
    ).toEqual(["handover"]);
  });

  it("leaves a lone suffix-shaped folder with no plain sibling under its literal name", () => {
    expect(foldCandidateNames(dirEntries("handover-cld"), CODES)).toEqual([
      "handover-cld",
    ]);
  });

  it("leaves a folder whose name merely ends in a reserved code literal", () => {
    expect(foldCandidateNames(dirEntries("claude-code-guide"), CODES)).toEqual([
      "claude-code-guide",
    ]);
    // "mycdx" ends in the letters of a reserved code but is not `<base>-<code>`,
    // so the existing "my" folder never absorbs it.
    expect(foldCandidateNames(dirEntries("my", "mycdx"), CODES)).toEqual([
      "my",
      "mycdx",
    ]);
  });

  it("never folds into an empty base name", () => {
    expect(foldCandidateNames(dirEntries("-cld"), CODES)).toEqual(["-cld"]);
  });

  it("drops non-directory entries", () => {
    expect(
      foldCandidateNames(
        [
          { name: "README.md", type: "file" },
          { name: "handover", type: "dir" },
          { name: ".github", type: "dir" },
          { name: "a-link", type: "symlink" },
        ],
        CODES,
      ),
    ).toEqual(["handover", ".github"]);
  });

  it("reads the reserved codes from the harness registry when none are injected", () => {
    expect(foldCandidateNames(dirEntries("handover", "handover-cld"))).toEqual([
      "handover",
    ]);
  });
});

describe("runList — a folded family reads the plain folder (2.4)", () => {
  it("lists the family once, taking its kind, version and description from the plain folder", async () => {
    mockRegistry({
      handover: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("The plain folder's prose."),
      },
      "handover-cld": {
        skillJson: { version: "9.9.9" },
        skillMd: skillMd("THE VARIANT'S PROSE — must never be printed"),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      ["handover", "skill", "v1.0.0", "The plain folder's prose."],
    ]);
    // The variant is never even fetched — folding happens on names alone.
    expect(fetchedPaths()).toEqual([
      "handover/skill.json",
      "handover/SKILL.md",
    ]);
  });

  it("lists a group's own name without listing any nested member of its own", async () => {
    mockRegistry({
      "workshop-group": {
        skillJson: {
          version: "1.0.0",
          description: "A group.",
          members: [{ kind: "nested", name: "nested-member" }],
        },
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["workshop-group"]);
    expect(consoleLogs.join("\n")).not.toContain("nested-member");
  });
});

// ---------------------------------------------------------------------------
// 2.5 — the name filter and the `_`-prefix exclusion, before any fetch.

describe("filterCandidateNames — name-only exclusions (2.5)", () => {
  const names = [
    "example-pointer-skill",
    "brainstorm",
    "_harness-suffix-fixture",
  ];

  it("matches a case-insensitive substring of the name", () => {
    expect(filterCandidateNames(names, "POINTER", false)).toEqual([
      "example-pointer-skill",
    ]);
    expect(filterCandidateNames(names, "pointer-skill", false)).toEqual([
      "example-pointer-skill",
    ]);
    expect(filterCandidateNames(names, "STORM", false)).toEqual(["brainstorm"]);
  });

  it("keeps every ordinary name when no filter is given", () => {
    expect(filterCandidateNames(names, undefined, false)).toEqual([
      "example-pointer-skill",
      "brainstorm",
    ]);
  });

  it("excludes testing names for an ordinary project and retains them for a test project", () => {
    expect(filterCandidateNames(names, undefined, true)).toEqual(names);
    expect(
      filterCandidateNames(names, "_harness-suffix-fixture", false),
    ).toEqual([]);
    expect(
      filterCandidateNames(names, "_harness-suffix-fixture", true),
    ).toEqual(["_harness-suffix-fixture"]);
  });
});

describe("runList — the filter runs before the fetches (2.5)", () => {
  it("fetches metadata only for the candidates the filter left standing", async () => {
    mockRegistry({
      "example-pointer-skill": {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Runs a PRD conversation."),
      },
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
      handover: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Hands work over."),
      },
      "mvp-scoping": {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Scopes an MVP."),
      },
    });

    const exitCode = await runList(["pointer"]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["example-pointer-skill"]);
    expect(fetchedPaths()).toEqual([
      "example-pointer-skill/skill.json",
      "example-pointer-skill/SKILL.md",
    ]);
  });

  it("does not fetch testing content's metadata for an ordinary project", async () => {
    seedManifest();
    mockRegistry({
      "_harness-suffix-fixture": {
        skillJson: { version: "1.0.0", testing: true },
        skillMd: skillMd("A fixture."),
      },
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
    });

    await runList([]);

    expect(fetchedPaths()).toEqual([
      "brainstorm/skill.json",
      "brainstorm/SKILL.md",
    ]);
  });

  it("does not match a filter against a description", async () => {
    mockRegistry({
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("A zebra-striped thinking protocol."),
      },
    });

    const exitCode = await runList(["zebra"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs).toEqual(['hatch list: nothing matches "zebra".']);
    expect(fetchRegistryFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2.6 — per-entry metadata: kind, version, removed, declared testing.

describe("runList — kind, removed content and declared testing (2.6)", () => {
  it("lists a plain skill as kind skill", async () => {
    mockRegistry({
      brainstorm: {
        skillJson: { version: "1.4.2" },
        skillMd: skillMd("Thinks out loud."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      ["brainstorm", "skill", "v1.4.2", "Thinks out loud."],
    ]);
  });

  it("lists a folder whose skill.json carries a members array as kind group", async () => {
    mockRegistry({
      "workshop-group": {
        skillJson: {
          version: "2.1.0",
          description: "Everything for a discovery workshop.",
          members: [{ kind: "nested", name: "a" }],
        },
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      [
        "workshop-group",
        "group",
        "v2.1.0",
        "Everything for a discovery workshop.",
      ],
    ]);
  });

  it("omits a removed entry even when a filter names it exactly", async () => {
    mockRegistry({
      "gone-skill": {
        skillJson: { version: "1.0.0", removed: true },
        skillMd: skillMd("Once useful."),
      },
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
    });

    const bare = await runList([]);
    expect(bare).toBe(0);
    expect(listedNames()).toEqual(["brainstorm"]);

    consoleLogs.length = 0;
    const filtered = await runList(["gone-skill"]);

    expect(filtered).toBe(0);
    expect(consoleLogs).toEqual(['hatch list: nothing matches "gone-skill".']);
  });

  it("excludes an unprefixed folder declaring testing: true from an ordinary project's listing", async () => {
    seedManifest();
    mockRegistry({
      "unprefixed-fixture": {
        skillJson: { version: "1.0.0", testing: true },
        skillMd: skillMd("Slipped in without the prefix."),
      },
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["brainstorm"]);
  });

  it("lists that same unprefixed folder for a project recording the opt-in", async () => {
    seedManifest({ testProject: true });
    mockRegistry({
      "unprefixed-fixture": {
        skillJson: { version: "1.0.0", testing: true },
        skillMd: skillMd("Slipped in without the prefix."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["unprefixed-fixture"]);
  });

  it("silently drops a top-level folder that is not registry content at all", async () => {
    mockRegistry({
      ".github": {},
      docs: {},
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(consoleErrors).toEqual([]);
    expect(listedNames()).toEqual(["brainstorm"]);
  });
});

// ---------------------------------------------------------------------------
// 2.7 — where a description comes from.

describe("runList — where a description comes from (2.7)", () => {
  it("takes a plain skill's description from its frontmatter and never from its skill.json", async () => {
    mockRegistry({
      brainstorm: {
        skillJson: {
          version: "1.0.0",
          description: "FROM SKILL JSON — must never be printed",
        },
        skillMd: skillMd("From the frontmatter."),
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      ["brainstorm", "skill", "v1.0.0", "From the frontmatter."],
    ]);
    expect(consoleLogs.join("\n")).not.toContain("FROM SKILL JSON");
  });

  it("takes a group's description from its skill.json, never fetching its SKILL.md or a member's", async () => {
    mockRegistry({
      "workshop-group": {
        skillJson: {
          version: "1.0.0",
          description: "The group's own prose.",
          members: [
            { kind: "nested", name: "a" },
            { kind: "pointer", name: "brainstorm" },
          ],
        },
        // Present only to prove they are never read.
        skillMd: skillMd("A GROUP SKILL MD — must never be fetched"),
        extraFiles: {
          "a/SKILL.md": skillMd("A MEMBER'S PROSE — must never be printed"),
        },
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      ["workshop-group", "group", "v1.0.0", "The group's own prose."],
    ]);
    expect(fetchedPaths()).toEqual(["workshop-group/skill.json"]);
    expect(fetchedPaths()).not.toContain("workshop-group/SKILL.md");
    const output = consoleLogs.join("\n");
    expect(output).not.toContain("A GROUP SKILL MD");
    expect(output).not.toContain("A MEMBER'S PROSE");
  });

  it("still lists a skill whose SKILL.md holds no readable description", async () => {
    mockRegistry({
      "no-frontmatter": {
        skillJson: { version: "3.0.0" },
        skillMd: "# Just a heading, no frontmatter\n",
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(rows()).toEqual([
      ["no-frontmatter", "skill", "v3.0.0", "(no description)"],
    ]);
  });

  it("still lists a skill with no SKILL.md at all", async () => {
    // A 404 says the file is not there, so the description genuinely is
    // absent — an ordinary listable state alongside no frontmatter and no
    // description key. This is the half of the distinction that leaves the
    // entry listed and the run successful; a transport failure is the other
    // half, and is asserted under registry failure below.
    mockRegistry({ "md-less": { skillJson: { version: "1.2.3" } } });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(consoleErrors).toEqual([]);
    expect(rows()).toEqual([
      ["md-less", "skill", "v1.2.3", "(no description)"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — rendering.

describe("renderListing — one entry per line, four fields, sorted (2.8)", () => {
  it("sorts ascending by name regardless of the order it is given", () => {
    const lines = renderListing([
      { name: "zebra", kind: "skill", version: "1.0.0" },
      { name: "alpha", kind: "group", version: "1.0.0" },
      { name: "middle", kind: "skill", version: "1.0.0" },
      { name: "_fixture", kind: "skill", version: "1.0.0" },
    ]);

    expect(lines.map((line) => line.split(/\s{2,}/)[0])).toEqual([
      "_fixture",
      "alpha",
      "middle",
      "zebra",
    ]);
  });

  it("shows the name, the kind, the current version and the description", () => {
    const [line] = renderListing([
      {
        name: "brainstorm",
        kind: "skill",
        version: "1.4.2",
        description: "Thinks out loud.",
      },
    ]);

    expect(line.split(/\s{2,}/)).toEqual([
      "brainstorm",
      "skill",
      "v1.4.2",
      "Thinks out loud.",
    ]);
  });

  it("renders a readable row for an entry with no description", () => {
    const [line] = renderListing([
      { name: "brainstorm", kind: "skill", version: "1.0.0" },
    ]);

    expect(line.split(/\s{2,}/)).toEqual([
      "brainstorm",
      "skill",
      "v1.0.0",
      "(no description)",
    ]);
  });

  it("collapses a description authored across several lines onto one row", () => {
    const [line] = renderListing([
      {
        name: "brainstorm",
        kind: "skill",
        version: "1.0.0",
        description: "first line\n  second line",
      },
    ]);

    expect(line).not.toContain("\n");
    expect(line.split(/\s{2,}/)[3]).toBe("first line second line");
  });

  it("renders nothing for no entries", () => {
    expect(renderListing([])).toEqual([]);
  });
});

describe("runList — ordering does not depend on the registry's order (2.8)", () => {
  it("prints alphabetically from a deliberately unsorted root listing", async () => {
    mockRegistry(
      {
        zebra: { skillJson: { version: "1.0.0" }, skillMd: skillMd("Z.") },
        alpha: { skillJson: { version: "1.0.0" }, skillMd: skillMd("A.") },
        middle: { skillJson: { version: "1.0.0" }, skillMd: skillMd("M.") },
      },
      ["zebra", "middle", "alpha"],
    );

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["alpha", "middle", "zebra"]);
  });
});

// ---------------------------------------------------------------------------
// 2.9 — an empty result is not a failure.

describe("runList — an empty result (2.9)", () => {
  it("reports an empty registry and exits successfully", async () => {
    mockRegistry({});

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(consoleLogs).toEqual([
      "hatch list: the registry has nothing to list.",
    ]);
    expect(consoleErrors).toEqual([]);
  });

  it("reports a filter that matched nothing and exits successfully", async () => {
    mockRegistry({
      brainstorm: { skillJson: { version: "1.0.0" }, skillMd: skillMd("B.") },
    });

    const exitCode = await runList(["nothing-like-this"]);

    expect(exitCode).toBe(0);
    expect(consoleLogs).toEqual([
      'hatch list: nothing matches "nothing-like-this".',
    ]);
  });

  it("words a filter naming a hidden testing skill identically to one matching nothing at all", async () => {
    seedManifest();
    mockRegistry({
      "_secret-fixture": {
        skillJson: { version: "1.0.0", testing: true },
        skillMd: skillMd("A fixture."),
      },
      brainstorm: { skillJson: { version: "1.0.0" }, skillMd: skillMd("B.") },
    });

    const hiddenExit = await runList(["_secret-fixture"]);
    const hiddenLogs = [...consoleLogs];
    const hiddenErrors = [...consoleErrors];

    consoleLogs.length = 0;
    consoleErrors.length = 0;
    // The same filter against a registry that genuinely has no such name.
    mockRegistry({
      brainstorm: { skillJson: { version: "1.0.0" }, skillMd: skillMd("B.") },
    });

    const missingExit = await runList(["_secret-fixture"]);

    expect(hiddenExit).toBe(0);
    expect(missingExit).toBe(0);
    expect(hiddenLogs).toEqual(consoleLogs);
    expect(hiddenErrors).toEqual(consoleErrors);
    expect(hiddenLogs.join("\n")).toBe(consoleLogs.join("\n"));
    const output = [...hiddenLogs, ...hiddenErrors].join("\n");
    expect(output).not.toContain("testing");
    expect(output).not.toContain("withheld");
    expect(output).not.toContain("test project");
  });
});

// ---------------------------------------------------------------------------
// 2.10 — registry failure.

describe("runList — registry failure (2.10)", () => {
  it("aborts with an unreachable-registry message, printing no entries", async () => {
    vi.mocked(listRegistryRoot).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    expect(consoleLogs).toEqual([]);
    expect(consoleErrors).toEqual([
      "hatch list: registry unreachable (could not reach the registry (network down)).",
    ]);
    expect(fetchRegistryFile).not.toHaveBeenCalled();
  });

  it("reports a root 404 as a credential problem, never as a name that was not found", async () => {
    vi.mocked(listRegistryRoot).mockResolvedValue({
      ok: false,
      reason: "no-registry-access",
      detail: "the registry root could not be read with these credentials",
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    expect(consoleLogs).toEqual([]);
    expect(consoleErrors).toEqual([
      "hatch list: these credentials do not grant access to the registry — check that the token can read the registry repository.",
    ]);
    const output = consoleErrors.join("\n");
    expect(output).toContain("credentials");
    expect(output).not.toContain("not found");
    expect(output).not.toContain("was not found in the registry");
    expect(fetchRegistryFile).not.toHaveBeenCalled();
  });

  it("gives the two root failures distinct messages", async () => {
    vi.mocked(listRegistryRoot).mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "could not reach the registry (network down)",
    });
    await runList([]);
    const unreachable = [...consoleErrors];

    consoleErrors.length = 0;
    vi.mocked(listRegistryRoot).mockResolvedValue({
      ok: false,
      reason: "no-registry-access",
      detail: "the registry root could not be read with these credentials",
    });
    await runList([]);

    expect(unreachable).not.toEqual(consoleErrors);
  });

  it("prints every readable entry, names the unreadable ones, and exits non-zero", async () => {
    mockRegistry({
      alpha: { skillJson: { version: "1.0.0" }, skillMd: skillMd("A.") },
      broken: { unreachable: true },
      zebra: { skillJson: { version: "2.0.0" }, skillMd: skillMd("Z.") },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    expect(listedNames()).toEqual(["alpha", "zebra"]);
    expect(consoleErrors.join("\n")).toContain("this listing is incomplete");
    expect(consoleErrors.some((m) => m.includes('"broken"'))).toBe(true);
  });

  it("names an entry whose SKILL.md could not be read, rather than printing it as having no description", async () => {
    // A 403/429/network error on SKILL.md says only that we could not read
    // it — the skill may well carry a description. Printing "(no
    // description)" and exiting 0 would misdescribe a real entry with no way
    // for the reader to tell, which is exactly the incomplete-listing-
    // mistaken-for-complete failure this path exists to prevent.
    mockRoot("alpha", "rate-limited", "zebra");
    vi.mocked(fetchRegistryFile).mockImplementation(async (_token, path) => {
      if (path.endsWith("/skill.json")) {
        return { ok: true, content: JSON.stringify({ version: "1.0.0" }) };
      }
      if (path === "rate-limited/SKILL.md") {
        return {
          ok: false,
          reason: "unreachable",
          detail: "the registry responded with an unexpected status (403)",
        };
      }
      return { ok: true, content: skillMd("Readable prose.") };
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    // Every readable entry is still printed...
    expect(rows()).toEqual([
      ["alpha", "skill", "v1.0.0", "Readable prose."],
      ["zebra", "skill", "v1.0.0", "Readable prose."],
    ]);
    // ...the unreadable one is named, and never rendered as a row.
    expect(listedNames()).not.toContain("rate-limited");
    expect(consoleErrors.join("\n")).toContain("this listing is incomplete");
    expect(consoleErrors.some((m) => m.includes('"rate-limited"'))).toBe(true);
    expect(consoleErrors.some((m) => m.includes("403"))).toBe(true);
    expect(consoleLogs.join("\n")).not.toContain("(no description)");
  });

  it("treats an unparseable skill.json as an unreadable entry rather than a silent omission", async () => {
    mockRegistry({
      alpha: { skillJson: { version: "1.0.0" }, skillMd: skillMd("A.") },
      garbled: { skillJson: "not json at all" },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(1);
    expect(listedNames()).toEqual(["alpha"]);
    expect(consoleErrors.some((m) => m.includes('"garbled"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.11 — nothing is written.

describe("runList — nothing is written (2.11)", () => {
  it("changes no file and creates no commit in an initialized, version-controlled project", async () => {
    await simpleGit(target).init();
    const manifestRaw = seedManifest();
    await simpleGit(target).add(".");
    await simpleGit(target).commit("initial");

    const commitsBefore = Number(
      (await simpleGit(target).raw(["rev-list", "--count", "--all"])).trim(),
    );

    mockRegistry({
      brainstorm: {
        skillJson: { version: "1.0.0" },
        skillMd: skillMd("Thinks out loud."),
      },
      "workshop-group": {
        skillJson: {
          version: "1.0.0",
          description: "A group.",
          members: [{ kind: "nested", name: "a" }],
        },
      },
    });

    const exitCode = await runList([]);

    expect(exitCode).toBe(0);
    expect(listedNames()).toEqual(["brainstorm", "workshop-group"]);
    // No file changed...
    expect(
      (await simpleGit(target).raw(["status", "--porcelain"])).trim(),
    ).toBe("");
    expect(readFileSync(join(target, "hatch.manifest.json"), "utf8")).toBe(
      manifestRaw,
    );
    // ...and no commit was created.
    expect(
      Number(
        (await simpleGit(target).raw(["rev-list", "--count", "--all"])).trim(),
      ),
    ).toBe(commitsBefore);
  });
});

// ---------------------------------------------------------------------------
// The bounded pool the per-entry fetches run through.

describe("mapWithConcurrency", () => {
  it("returns results in input order, whatever order the workers finish in", async () => {
    const result = await mapWithConcurrency([5, 1, 3], 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms * 10;
    });

    expect(result).toEqual([50, 10, 30]);
  });

  it("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async (i) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return i;
      },
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it("does no work at all for an empty list", async () => {
    const worker = vi.fn();

    expect(await mapWithConcurrency([], 4, worker)).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
