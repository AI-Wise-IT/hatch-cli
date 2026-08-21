import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  conformanceProblems,
  loadRecords,
  parseRecord,
  splitSections,
  unfailableReason,
} from "./records.mjs";

const SECTION_ORDER = [
  "Metadata",
  "Decision",
  "Context",
  "Alternatives Considered",
  "Trade-offs Accepted",
  "Consequences",
  "Agent Rules",
  "Invariants",
  "Machine Check",
  "Precedence",
];

/** Builds a record that conforms, so a test can break exactly one thing about it. */
function record(overrides = {}) {
  const bodies = {
    Metadata: [
      "- **id:** 0001-example",
      "- **component:** example",
      "- **status:** accepted",
    ].join("\n"),
    Decision: "The thing is decided.",
    Context: "Why.",
    "Alternatives Considered": "- Something else.",
    "Trade-offs Accepted": "- A cost.",
    Consequences: "- A consequence.",
    "Agent Rules": "- MUST do the thing.",
    Invariants: "None.",
    "Machine Check": [
      "- **context:** cli-repo",
      "",
      "```bash",
      "test -f package.json",
      "```",
      "",
      "Expected result: exit 0.",
    ].join("\n"),
    Precedence: "- No known conflicting decision records.",
    ...overrides,
  };
  const parts = ["# Example record", ""];
  for (const heading of SECTION_ORDER) {
    if (bodies[heading] === undefined) continue;
    parts.push(`## ${heading}`, "", bodies[heading], "");
  }
  return parts.join("\n");
}

const problems = (overrides) =>
  conformanceProblems(parseRecord("0001-example.md", record(overrides)));

describe("splitSections", () => {
  it("keys each level-2 section by its heading", () => {
    const sections = splitSections("## One\n\nfirst\n\n## Two\n\nsecond\n");
    expect([...sections.keys()]).toEqual(["One", "Two"]);
    expect(sections.get("One").trim()).toBe("first");
  });
});

describe("extraction", () => {
  it("reads status, context and the check out of a conforming record", () => {
    const parsed = parseRecord("0001-example.md", record());
    expect(parsed.status).toBe("accepted");
    expect(parsed.context).toBe("cli-repo");
    expect(parsed.command).toBe("test -f package.json");
    expect(parsed.expected).toBe(true);
    expect(conformanceProblems(parsed)).toEqual([]);
  });

  it("fails a record whose executable check has no fenced block", () => {
    const found = problems({
      "Machine Check": "- **context:** cli-repo\n\nExpected result: exit 0.",
    });
    expect(found).toContain(
      "declares an executable context but carries no fenced `bash` block",
    );
  });

  it("fails a record that declares no context", () => {
    const found = problems({
      "Machine Check":
        "```bash\ntest -f package.json\n```\n\nExpected result: exit 0.",
    });
    expect(found).toContain("declares no `context` in `## Machine Check`");
  });
});

describe("conformance", () => {
  it("names a missing required section", () => {
    expect(problems({ Invariants: undefined })).toContain(
      "missing required section `## Invariants`",
    );
  });

  it("rejects a status outside the permitted set", () => {
    const found = problems({ Metadata: "- **status:** draft" });
    expect(found.some((p) => p.startsWith("declares status `draft`"))).toBe(
      true,
    );
  });

  it("rejects a missing status", () => {
    expect(problems({ Metadata: "- **id:** 0001-example" })).toContain(
      "declares no `status` in `## Metadata`",
    );
  });

  it("requires a superseded record to name its replacement", () => {
    expect(problems({ Metadata: "- **status:** superseded" })).toContain(
      "is superseded but names no `superseded_by` record",
    );
  });

  it("rejects an unexpanded placeholder in a check", () => {
    const found = problems({
      "Machine Check": [
        "- **context:** cli-repo",
        "",
        "```bash",
        "test -f <group-folder>/skill.json",
        "```",
        "",
        "Expected result: exit 0.",
      ].join("\n"),
    });
    expect(found).toContain(
      "carries the unexpanded placeholder `<group-folder>` in its check",
    );
  });

  it("requires a non-executable context to name a reason", () => {
    const found = problems({ "Machine Check": "- **context:** review-only" });
    expect(found).toContain(
      "declares context `review-only` but names no `reason` for it",
    );
  });

  it("refuses a non-executable context that still presents a command", () => {
    const found = problems({
      "Machine Check": [
        "- **context:** review-only",
        "- **reason:** it needs judgment.",
        "",
        "```bash",
        "grep -n shadow src/registry/collision-check.ts",
        "```",
      ].join("\n"),
    });
    expect(
      found.some((p) => p.includes("presents a fenced `bash` block")),
    ).toBe(true);
  });
});

describe("unfailableReason", () => {
  it("accepts a command whose failure propagates", () => {
    expect(unfailableReason("grep -q vitest package.json")).toBeNull();
  });

  it("accepts a command that declares an explicit failure path", () => {
    expect(
      unfailableReason(
        'tags=$(git tag -l)\n[ -n "$tags" ] || exit 1\necho "$tags" | head -5',
      ),
    ).toBeNull();
  });

  it("rejects a trailing `|| true`", () => {
    expect(unfailableReason("grep -rn thing src/ || true")).toMatch(
      /exits 0 whatever it finds/,
    );
  });

  it("rejects failure swallowed by a trailing message", () => {
    expect(unfailableReason('grep -rn thing src/ || echo "correct"')).toMatch(
      /trailing/,
    );
  });

  it("rejects a pipeline that discards its own exit status", () => {
    expect(unfailableReason('git tag -l "*@*" | head -5')).toMatch(
      /discards the exit status/,
    );
  });

  it("rejects a check that ends in a bare echo", () => {
    expect(
      unfailableReason('grep -q thing src/x.ts && echo ok\necho "done"'),
    ).toMatch(/bare `echo`/);
  });
});

describe("loadRecords", () => {
  const directories = [];
  afterEach(() => {
    for (const dir of directories.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("evaluates the whole corpus, naming a record that omits a required section", () => {
    const dir = mkdtempSync(join(tmpdir(), "adr-corpus-"));
    directories.push(dir);
    writeFileSync(join(dir, "0001-fine.md"), record());
    writeFileSync(
      join(dir, "0002-broken.md"),
      record({ "Agent Rules": undefined }),
    );
    writeFileSync(join(dir, "notes.txt"), "ignored");

    const loaded = loadRecords(dir);
    expect(loaded.map((r) => r.name)).toEqual([
      "0001-fine.md",
      "0002-broken.md",
    ]);
    expect(conformanceProblems(loaded[0])).toEqual([]);
    expect(conformanceProblems(loaded[1])).toContain(
      "missing required section `## Agent Rules`",
    );
  });
});
