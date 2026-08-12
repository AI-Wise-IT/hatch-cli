import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashEntries, hashFromDisk } from "./content-hash.js";

describe("hashEntries", () => {
  it("is stable regardless of input order (sorted internally)", () => {
    const a = hashEntries([
      ["b.md", "B"],
      ["a.md", "A"],
    ]);
    const b = hashEntries([
      ["a.md", "A"],
      ["b.md", "B"],
    ]);
    expect(a).toBe(b);
  });

  it("changes when any content changes", () => {
    const a = hashEntries([["a.md", "A"]]);
    const b = hashEntries([["a.md", "A-edited"]]);
    expect(a).not.toBe(b);
  });

  it("changes when the file set changes", () => {
    const a = hashEntries([["a.md", "A"]]);
    const b = hashEntries([
      ["a.md", "A"],
      ["b.md", "B"],
    ]);
    expect(a).not.toBe(b);
  });
});

describe("hashFromDisk", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hatch-content-hash-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("matches hashEntries for the same content read back from disk", () => {
    writeFileSync(join(dir, "SKILL.md"), "# Hi", "utf8");
    const expected = hashEntries([["SKILL.md", "# Hi"]]);
    expect(hashFromDisk(dir, ["SKILL.md"])).toBe(expected);
  });

  it("hashes a missing file as empty content", () => {
    const expected = hashEntries([["missing.md", ""]]);
    expect(hashFromDisk(dir, ["missing.md"])).toBe(expected);
  });

  it("reads a nested relative path", () => {
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "sub", "nested.md"), "nested", "utf8");
    const expected = hashEntries([["sub/nested.md", "nested"]]);
    expect(hashFromDisk(dir, ["sub/nested.md"])).toBe(expected);
  });
});
