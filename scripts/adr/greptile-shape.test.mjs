import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shapeProblems } from "./greptile-shape.mjs";
import { RECORDS_DIR } from "./records.mjs";

const directories = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A checkout whose reviewer configuration has its recorded shape. */
function checkout() {
  const root = mkdtempSync(join(tmpdir(), "greptile-shape-"));
  directories.push(root);
  const records = join(root, "docs", "architecture", "decisions");
  mkdirSync(records, { recursive: true });
  cpSync(RECORDS_DIR, records, { recursive: true });
  cpSync(".greptile", join(root, ".greptile"), { recursive: true });
  return root;
}

const config = (root) =>
  JSON.parse(readFileSync(join(root, ".greptile", "config.json"), "utf8"));

const writeConfig = (root, value) =>
  writeFileSync(
    join(root, ".greptile", "config.json"),
    JSON.stringify(value, null, 2),
  );

const problems = (root) =>
  shapeProblems({
    root,
    records: join(root, "docs", "architecture", "decisions"),
  });

describe("shapeProblems", () => {
  it("passes a checkout whose configuration has its recorded shape", () => {
    expect(problems(checkout())).toEqual([]);
  });

  it("fails a second root configuration form", () => {
    const root = checkout();
    writeFileSync(join(root, "greptile.json"), JSON.stringify({ rules: [] }));
    const found = problems(root);
    expect(
      found.some((p) => p.includes("second root configuration form")),
    ).toBe(true);
    expect(found.some((p) => p.includes("silently ignored"))).toBe(true);
  });

  it("fails configuration nested in a subdirectory, naming it", () => {
    const root = checkout();
    mkdirSync(join(root, "src", ".greptile"), { recursive: true });
    writeFileSync(
      join(root, "src", ".greptile", "config.json"),
      JSON.stringify({
        disabledRules: ["adr-0024-registry-collision-predicate"],
      }),
    );
    const found = problems(root);
    expect(found.some((p) => p.includes("src/.greptile/"))).toBe(true);
    expect(found.some((p) => p.includes("outside the repository root"))).toBe(
      true,
    );
  });

  it("fails a configuration that would post a status check", () => {
    const root = checkout();
    writeConfig(root, { ...config(root), statusCheck: true });
    expect(problems(root).some((p) => p.includes("`statusCheck`"))).toBe(true);
  });

  it("fails when statusCheck is merely absent, not explicitly false", () => {
    const root = checkout();
    const { statusCheck, ...rest } = config(root);
    writeConfig(root, rest);
    expect(problems(root).some((p) => p.includes("`statusCheck`"))).toBe(true);
  });

  it("fails an accepted record missing from files.json", () => {
    const root = checkout();
    const files = JSON.parse(
      readFileSync(join(root, ".greptile", "files.json"), "utf8"),
    );
    files.files = files.files.filter(
      (entry) => !entry.path.includes("0024-registry-collision-predicate"),
    );
    writeFileSync(
      join(root, ".greptile", "files.json"),
      JSON.stringify(files, null, 2),
    );
    const found = problems(root);
    expect(
      found.some(
        (p) =>
          p.includes("0024-registry-collision-predicate") &&
          p.includes("never reads it"),
      ),
    ).toBe(true);
  });

  it("fails an entry in files.json that is not an accepted record", () => {
    const root = checkout();
    const path = join(root, ".greptile", "files.json");
    const files = JSON.parse(readFileSync(path, "utf8"));
    files.files.push({ path: "docs/architecture/decisions/0099-invented.md" });
    writeFileSync(path, JSON.stringify(files, null, 2));
    expect(
      problems(root).some(
        (p) =>
          p.includes("0099-invented") &&
          p.includes("not the path of an accepted record"),
      ),
    ).toBe(true);
  });

  it("fails an accepted record carrying no rule, naming the record", () => {
    const root = checkout();
    const value = config(root);
    value.rules = value.rules.filter(
      (rule) => rule.id !== "adr-0024-registry-collision-predicate",
    );
    writeConfig(root, value);
    const found = problems(root);
    expect(
      found.some(
        (p) =>
          p.includes("adr-0024-registry-collision-predicate") &&
          p.includes("0024-registry-collision-predicate"),
      ),
    ).toBe(true);
  });

  it("fails a files.json entry substituted for a different file of the same name", () => {
    const root = checkout();
    const path = join(root, ".greptile", "files.json");
    const files = JSON.parse(readFileSync(path, "utf8"));
    for (const entry of files.files) {
      if (entry.path.includes("0024-registry-collision-predicate")) {
        entry.path = "docs/decoy/0024-registry-collision-predicate.md";
      }
    }
    writeFileSync(path, JSON.stringify(files, null, 2));
    const found = problems(root);
    expect(
      found.some(
        (p) =>
          p.includes("carries no entry") &&
          p.includes("0024-registry-collision-predicate"),
      ),
    ).toBe(true);
    expect(
      found.some(
        (p) =>
          p.includes("docs/decoy/0024-registry-collision-predicate.md") &&
          p.includes("not the path of an accepted record"),
      ),
    ).toBe(true);
  });

  it("fails an accepted record whose rule is present but disabled", () => {
    const root = checkout();
    const value = config(root);
    for (const rule of value.rules) {
      if (rule.id === "adr-0026-git-optional-dependency") rule.enabled = false;
    }
    writeConfig(root, value);
    const found = problems(root);
    expect(
      found.some(
        (p) =>
          p.includes("0026-git-optional-dependency") &&
          p.includes("not covered") &&
          p.includes("disabled"),
      ),
    ).toBe(true);
  });

  it("fails an accepted record switched off through `disabledRules`", () => {
    const root = checkout();
    const value = config(root);
    value.disabledRules = ["adr-0026-git-optional-dependency"];
    writeConfig(root, value);
    expect(
      problems(root).some(
        (p) =>
          p.includes("0026-git-optional-dependency") &&
          p.includes("disabledRules"),
      ),
    ).toBe(true);
  });

  it("fails an accepted record whose rule no longer names it", () => {
    const root = checkout();
    const value = config(root);
    for (const rule of value.rules) {
      if (rule.id === "adr-0026-git-optional-dependency") {
        rule.rule = "Reach git through one module.";
      }
    }
    writeConfig(root, value);
    expect(
      problems(root).some(
        (p) =>
          p.includes("0026-git-optional-dependency") &&
          p.includes("does not name record"),
      ),
    ).toBe(true);
  });

  it("fails an absent root configuration", () => {
    const root = checkout();
    rmSync(join(root, ".greptile"), { recursive: true, force: true });
    const found = problems(root);
    expect(
      found.some((p) => p.includes("no `.greptile/` at the repository root")),
    ).toBe(true);
  });

  it("fails configuration that is not valid JSON", () => {
    const root = checkout();
    writeFileSync(join(root, ".greptile", "config.json"), "{ rules: [");
    expect(problems(root).some((p) => p.includes("not valid JSON"))).toBe(true);
  });
});
