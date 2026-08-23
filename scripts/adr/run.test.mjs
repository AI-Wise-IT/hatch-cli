import { describe, expect, it } from "vitest";
import { classify, report, runAll } from "./run.mjs";

/** A parsed record, reduced to the fields the runner and the report read. */
function record(overrides = {}) {
  return {
    name: "0024-registry-collision-predicate.md",
    status: "accepted",
    context: "greptile-review",
    reason: null,
    reviewer: "Greptile, by the rule `adr-0024-registry-collision-predicate`.",
    command: "exit 0",
    supersededBy: null,
    ...overrides,
  };
}

const roots = { cli: process.cwd(), registry: null };
const run = (records, repo = "cli") => runAll(records, { repo, roots });

describe("classify", () => {
  it("runs a delegating record where `cli-repo` runs", () => {
    expect(classify(record(), "cli")).toBe("execute");
    expect(classify(record(), "all")).toBe("execute");
  });

  it("defers a delegating record in the registry's run", () => {
    expect(classify(record(), "registry")).toBe("deferred");
  });

  it("still reports a record no reviewer judges as unverified", () => {
    const found = classify(record({ context: "review-only" }), "cli");
    expect(found).toBe("unverified");
  });

  it("skips a superseded delegating record", () => {
    const found = classify(record({ status: "superseded" }), "cli");
    expect(found).toBe("skipped");
  });
});

describe("runAll", () => {
  it("reports a passing delegation as delegated, never as passed", () => {
    const [result] = run([record()]);
    expect(result.outcome).toBe("delegated");
  });

  it("reports a failing delegation as failed, not as delegated", () => {
    const [result] = run([
      record({ command: 'echo "no such rule" >&2\nexit 1' }),
    ]);
    expect(result.outcome).toBe("failed");
    expect(result.output).toContain("no such rule");
  });

  it("still reports an ordinary passing check as passed", () => {
    const [result] = run([record({ context: "cli-repo", reviewer: null })]);
    expect(result.outcome).toBe("passed");
  });
});

describe("report", () => {
  it("labels a delegated record JUDGE and names its reviewer", () => {
    const rendered = report(run([record()]), { repo: "cli" });
    expect(rendered).toMatch(/^JUDGE /m);
    expect(rendered).not.toMatch(/^PASS /m);
    expect(rendered).toContain("judged by: Greptile");
  });

  it("labels a failing delegation FAIL rather than JUDGE", () => {
    const rendered = report(run([record({ command: "exit 1" })]), {
      repo: "cli",
    });
    expect(rendered).toMatch(/^FAIL /m);
    expect(rendered).not.toMatch(/JUDGE/);
  });

  it("counts a delegated record in its own summary bucket", () => {
    const rendered = report(run([record()]), { repo: "cli" });
    expect(rendered).toContain("1 records (repo: cli): 1 delegated");
  });

  it("accounts for every record across every outcome", () => {
    const results = run([
      record(),
      record({ name: "0001-a.md", context: "cli-repo", reviewer: null }),
      record({
        name: "0002-b.md",
        context: "review-only",
        command: null,
        reason: "it needs judgment.",
      }),
      record({
        name: "0003-c.md",
        status: "superseded",
        supersededBy: "0004-d",
      }),
      record({ name: "0004-d.md", context: "registry-checkout" }),
    ]);
    const rendered = report(results, { repo: "cli" });
    const summary = rendered.split("\n").at(-1);
    const counted = [...summary.matchAll(/(\d+) [a-z]+/g)]
      .slice(1)
      .reduce((total, [, n]) => total + Number(n), 0);
    expect(counted).toBe(results.length);
    expect(summary).toContain("1 delegated");
  });

  it("names the CLI repository's job when a delegation is deferred", () => {
    const rendered = report(run([record()], "registry"), { repo: "registry" });
    expect(rendered).toContain("runs in the CLI repository's job");
  });
});
