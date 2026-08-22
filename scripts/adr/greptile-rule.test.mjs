import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { delegationProblem, readConfig, ruleIdFor } from "./greptile-rule.mjs";

const RECORD = "0024-registry-collision-predicate";

/** A configuration whose rule resolves, so a test can break one thing about it. */
function config(overrides = {}) {
  return JSON.stringify({
    statusCheck: false,
    rules: [
      {
        id: ruleIdFor(RECORD),
        rule: `Enforce the Agent Rules of decision record ${RECORD}.`,
        scope: ["src/registry/**"],
        ...overrides,
      },
    ],
  });
}

const problem = (source, record = RECORD) => delegationProblem(source, record);

describe("ruleIdFor", () => {
  it("binds a rule to a record by the record's own identifier", () => {
    expect(ruleIdFor(RECORD)).toBe(`adr-${RECORD}`);
  });
});

describe("delegationProblem", () => {
  it("resolves a rule that is present, active and names its record", () => {
    expect(problem(config())).toBeNull();
  });

  it("names an absent configuration", () => {
    expect(problem(null)).toMatch(/no reviewer configuration at/);
  });

  it("names a configuration that is not valid JSON", () => {
    expect(problem("{ rules: [ ")).toMatch(/is not valid JSON/);
  });

  it("rejects a configuration that is not a JSON object", () => {
    expect(problem("[]")).toMatch(/does not hold a JSON object/);
    expect(problem("null")).toMatch(/does not hold a JSON object/);
  });

  it("names a configuration carrying no rules array", () => {
    expect(problem(JSON.stringify({ statusCheck: false }))).toMatch(
      /declares no `rules` array/,
    );
  });

  it("names a record whose rule is missing", () => {
    const found = problem(config(), "0014-registry-collision-detection");
    expect(found).toMatch(
      /carries no rule `adr-0014-registry-collision-detection`/,
    );
    expect(found).toMatch(/has lost its judge/);
  });

  it("fails a rule that is present but disabled, as it does a missing one", () => {
    expect(problem(config({ enabled: false }))).toMatch(/but disabled/);
  });

  it("fails a rule switched off through `disabledRules`", () => {
    const source = JSON.stringify({
      disabledRules: [ruleIdFor(RECORD)],
      rules: [{ id: ruleIdFor(RECORD), rule: `See ${RECORD}.` }],
    });
    expect(problem(source)).toMatch(/is listed in `disabledRules`/);
  });

  it("passes a rule that does not mention `enabled`, which the reviewer applies", () => {
    expect(problem(config())).toBeNull();
    expect(problem(config({ enabled: true }))).toBeNull();
  });

  it("fails a rule that does not name the record it is bound to", () => {
    const found = problem(config({ rule: "Compare physical source paths." }));
    expect(found).toMatch(/does not name record/);
    expect(found).toMatch(/the binding between the two is broken/);
  });

  it("reads a rule's text from whichever field carries it", () => {
    const source = JSON.stringify({
      rules: [{ id: ruleIdFor(RECORD), description: `See ${RECORD}.` }],
    });
    expect(problem(source)).toBeNull();
  });

  it("ignores a malformed entry in the rules array rather than throwing", () => {
    const source = JSON.stringify({
      rules: [null, "not a rule", { id: ruleIdFor(RECORD), rule: RECORD }],
    });
    expect(problem(source)).toBeNull();
  });
});

describe("readConfig", () => {
  const directories = [];
  afterEach(() => {
    for (const dir of directories.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("returns null for a configuration that is not there", () => {
    const dir = mkdtempSync(join(tmpdir(), "greptile-rule-"));
    directories.push(dir);
    expect(readConfig(join(dir, "config.json"))).toBeNull();
  });

  it("reads a configuration that is there", () => {
    const dir = mkdtempSync(join(tmpdir(), "greptile-rule-"));
    directories.push(dir);
    const path = join(dir, "config.json");
    writeFileSync(path, config());
    expect(delegationProblem(readConfig(path), RECORD, path)).toBeNull();
  });
});
