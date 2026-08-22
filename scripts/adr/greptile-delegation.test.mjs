import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { delegationProblems } from "./greptile-delegation.mjs";
import { RECORDS_DIR } from "./records.mjs";

const DELEGATING = "0024-registry-collision-predicate";

const directories = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "greptile-delegation-"));
  directories.push(dir);
  return dir;
}

const configPath = (dir) => join(dir, "config.json");

const writeConfig = (dir, value) => {
  const path = configPath(dir);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
};

const realConfig = () =>
  JSON.parse(readFileSync(join(".greptile", "config.json"), "utf8"));

const problems = (config) =>
  delegationProblems({ records: RECORDS_DIR, config });

describe("delegationProblems", () => {
  it("passes the real record set against the real configuration", () => {
    expect(problems(join(".greptile", "config.json"))).toEqual([]);
  });

  it("fails when a delegating record's rule is deleted, naming the record", () => {
    const value = realConfig();
    value.rules = value.rules.filter((rule) => rule.id !== `adr-${DELEGATING}`);
    const found = problems(writeConfig(workspace(), value));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(DELEGATING);
    expect(found[0]).toContain("names a judge but");
    expect(found[0]).toContain("has lost its judge");
  });

  it("fails when a delegating record's rule is disabled", () => {
    const value = realConfig();
    for (const rule of value.rules) {
      if (rule.id === `adr-${DELEGATING}`) rule.enabled = false;
    }
    const found = problems(writeConfig(workspace(), value));
    expect(found.some((p) => p.includes("but disabled"))).toBe(true);
  });

  it("fails when a rule no longer names the record it is bound to", () => {
    const value = realConfig();
    for (const rule of value.rules) {
      if (rule.id === `adr-${DELEGATING}`) rule.rule = "Compare source paths.";
    }
    const found = problems(writeConfig(workspace(), value));
    expect(found.some((p) => p.includes("does not name record"))).toBe(true);
  });

  it("fails every delegating record at once when the configuration is gone", () => {
    const found = problems(join(workspace(), "absent.json"));
    expect(found).toHaveLength(5);
    for (const problem of found) expect(problem).toContain("names a judge but");
  });

  it("fails a `review-only` record that has quietly acquired a rule", () => {
    const dir = workspace();
    const records = join(dir, "records");
    rmSync(records, { recursive: true, force: true });
    const unjudged = [
      "## Metadata",
      "",
      "- **id:** 0099-unjudged",
      "- **status:** accepted",
      "",
      "## Machine Check",
      "",
      "- **context:** review-only",
      "- **reason:** it needs judgment and nobody performs it.",
      "",
      "A reviewer would establish it by reading the module.",
      "",
    ].join("\n");
    const recordDir = mkdtempSync(join(tmpdir(), "greptile-records-"));
    directories.push(recordDir);
    writeFileSync(join(recordDir, "0099-unjudged.md"), unjudged);

    const withRule = writeConfig(dir, {
      rules: [{ id: "adr-0099-unjudged", rule: "Enforce 0099-unjudged." }],
    });
    const found = delegationProblems({ records: recordDir, config: withRule });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("0099-unjudged");
    expect(found[0]).toContain("no reviewer judges it");
    expect(found[0]).toContain("declares `greptile-review`");
  });

  it("passes a `review-only` record that carries no rule", () => {
    const dir = workspace();
    const recordDir = mkdtempSync(join(tmpdir(), "greptile-records-"));
    directories.push(recordDir);
    writeFileSync(
      join(recordDir, "0099-unjudged.md"),
      [
        "## Metadata",
        "",
        "- **status:** accepted",
        "",
        "## Machine Check",
        "",
        "- **context:** review-only",
        "- **reason:** nobody judges it.",
        "",
      ].join("\n"),
    );
    const config = writeConfig(dir, { rules: [] });
    expect(delegationProblems({ records: recordDir, config })).toEqual([]);
  });

  it("ignores a superseded record, whose check is not executed", () => {
    const recordDir = mkdtempSync(join(tmpdir(), "greptile-records-"));
    directories.push(recordDir);
    writeFileSync(
      join(recordDir, "0099-unjudged.md"),
      [
        "## Metadata",
        "",
        "- **status:** superseded",
        "- **superseded_by:** 0100-later",
        "",
        "## Machine Check",
        "",
        "- **context:** review-only",
        "",
      ].join("\n"),
    );
    const config = writeConfig(workspace(), {
      rules: [{ id: "adr-0099-unjudged", rule: "Enforce 0099-unjudged." }],
    });
    expect(delegationProblems({ records: recordDir, config })).toEqual([]);
  });
});
