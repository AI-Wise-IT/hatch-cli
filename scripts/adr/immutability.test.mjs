import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describe as explain,
  frozenViolations,
  mergeBase,
  readRecordsAtRef,
} from "./immutability.mjs";

const DIR = "docs/architecture/decisions";

function build({
  status = "accepted",
  decision = "The thing is decided.",
  check = "test -f package.json",
  precedence = "- No known conflicting decision records.",
} = {}) {
  return [
    "# Example record",
    "",
    "## Metadata",
    "",
    "- **id:** 0001-example",
    `- **status:** ${status}`,
    "",
    "## Decision",
    "",
    decision,
    "",
    "## Agent Rules",
    "",
    "- MUST do the thing.",
    "",
    "## Invariants",
    "",
    "None.",
    "",
    "## Machine Check",
    "",
    "- **context:** cli-repo",
    "",
    "```bash",
    check,
    "```",
    "",
    "Expected result: exit 0.",
    "",
    "## Precedence",
    "",
    precedence,
    "",
  ].join("\n");
}

describe("frozenViolations", () => {
  let repo;

  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  const write = (text) =>
    writeFileSync(join(repo, DIR, "0001-example.md"), text);
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-m", message);
  };
  const violationsAgainst = (baseRef) =>
    frozenViolations(readAt(baseRef), readAt("HEAD"));
  const readAt = (ref) => {
    const previous = process.cwd();
    process.chdir(repo);
    try {
      return readRecordsAtRef(ref, DIR);
    } finally {
      process.chdir(previous);
    }
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "adr-git-"));
    mkdirSync(join(repo, DIR), { recursive: true });
    git("init", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write(build());
    commit("record as accepted");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("passes when nothing changed", () => {
    expect(violationsAgainst("HEAD")).toEqual([]);
  });

  it("fails an edited Decision", () => {
    const base = git("rev-parse", "HEAD").trim();
    write(build({ decision: "The thing is decided differently." }));
    commit("rewrite the decision");
    expect(violationsAgainst(base)).toEqual([
      { record: "0001-example.md", section: "Decision", kind: "edited" },
    ]);
  });

  it("permits an edited Machine Check", () => {
    const base = git("rev-parse", "HEAD").trim();
    write(build({ check: "test -f package.json && test -f tsconfig.json" }));
    commit("repair the rotted check");
    expect(violationsAgainst(base)).toEqual([]);
  });

  it("permits a cross-reference added to Precedence", () => {
    const base = git("rev-parse", "HEAD").trim();
    write(build({ precedence: "- Extended by 0002-later-record." }));
    commit("cross-reference a later record");
    expect(violationsAgainst(base)).toEqual([]);
  });

  it("fails a record flipped to concept and back in one commit", () => {
    const base = git("rev-parse", "HEAD").trim();
    write(
      build({
        status: "concept",
        decision: "Rewritten while pretending to be a concept.",
      }),
    );
    write(
      build({
        status: "accepted",
        decision: "Rewritten while pretending to be a concept.",
      }),
    );
    commit("flip to concept, rewrite, flip back");
    expect(violationsAgainst(base)).toEqual([
      { record: "0001-example.md", section: "Decision", kind: "edited" },
    ]);
  });

  it("permits any edit to a record that was concept at the merge base", () => {
    write(build({ status: "concept" }));
    commit("demote to concept");
    const base = git("rev-parse", "HEAD").trim();
    write(
      build({
        status: "concept",
        decision: "Reworked while still working material.",
      }),
    );
    commit("rework the concept");
    expect(violationsAgainst(base)).toEqual([]);
  });

  it("fails a removed accepted record", () => {
    const base = git("rev-parse", "HEAD").trim();
    rmSync(join(repo, DIR, "0001-example.md"));
    writeFileSync(join(repo, DIR, "0002-other.md"), build());
    commit("delete the record");
    expect(violationsAgainst(base)).toEqual([
      { record: "0001-example.md", section: null, kind: "removed" },
    ]);
  });

  it("ignores main's own moves by comparing against the merge base", () => {
    const branchPoint = git("rev-parse", "HEAD").trim();
    git("checkout", "-b", "feature");
    write(build({ check: "test -f package.json && test -f biome.json" }));
    commit("repair the check on the branch");
    git("checkout", "main");
    write(build({ decision: "Superseding rewrite that landed on main." }));
    commit("main moves on");
    git("checkout", "feature");

    const previous = process.cwd();
    process.chdir(repo);
    try {
      expect(mergeBase("main", "HEAD")).toBe(branchPoint);
    } finally {
      process.chdir(previous);
    }
    expect(violationsAgainst(mergeBaseIn(repo, "main", "HEAD"))).toEqual([]);
  });
});

function mergeBaseIn(repo, base, head) {
  return execFileSync("git", ["merge-base", base, head], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

describe("the failure report", () => {
  it("names the record, the section, and supersession as the remedy", () => {
    const message = explain([
      {
        record: "0002-cli-runtime-nodejs.md",
        section: "Agent Rules",
        kind: "edited",
      },
    ]);
    expect(message).toContain("0002-cli-runtime-nodejs.md");
    expect(message).toContain("`## Agent Rules` was edited");
    expect(message).toContain("status at the merge base is `accepted`");
    expect(message).toContain("superseded, never edited");
    expect(message).toContain("Machine Check");
  });
});
