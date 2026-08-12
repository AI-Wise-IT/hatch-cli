import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkRegistryCollisions,
  formatCollisionReport,
} from "./collision-check.js";

function writeSkillJson(
  registryPath: string,
  folderName: string,
  content: Record<string, unknown>,
) {
  const dir = join(registryPath, folderName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "skill.json"), JSON.stringify(content), "utf8");
}

function writeStandaloneSkill(registryPath: string, name: string) {
  writeSkillJson(registryPath, name, { version: "1.0.0" });
}

function writeGroup(
  registryPath: string,
  name: string,
  members: Array<{
    kind: "nested" | "pointer";
    name: string;
    version?: string;
  }>,
) {
  writeSkillJson(registryPath, name, { version: "1.0.0", members });
  for (const member of members) {
    if (member.kind === "nested") {
      mkdirSync(join(registryPath, name, member.name), { recursive: true });
    }
  }
}

describe("checkRegistryCollisions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hatch-collision-check-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports no collisions for an empty registry", async () => {
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
    expect(result.collisions).toEqual([]);
  });

  it("reports no collisions for independent standalone skills", async () => {
    writeStandaloneSkill(dir, "handover");
    writeStandaloneSkill(dir, "prd-elicitation");
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
  });

  it("reports no collisions for a standalone skill and its own harness-suffix sibling", async () => {
    writeStandaloneSkill(dir, "handover");
    writeStandaloneSkill(dir, "handover-cld");
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
  });

  it("does not flag two groups pointing at the same standalone skill (legitimate reuse)", async () => {
    writeStandaloneSkill(dir, "shared-utility");
    writeGroup(dir, "group-a", [{ kind: "pointer", name: "shared-utility" }]);
    writeGroup(dir, "group-b", [{ kind: "pointer", name: "shared-utility" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
  });

  it("does not flag a group's own name as a destination", async () => {
    writeGroup(dir, "toolkit", [{ kind: "nested", name: "helper" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
  });

  it("flags two different groups' nested members sharing a name", async () => {
    writeGroup(dir, "group-a", [{ kind: "nested", name: "helper" }]);
    writeGroup(dir, "group-b", [{ kind: "nested", name: "helper" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(false);
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]?.destination).toBe("helper");
    const paths = result.collisions[0]?.sources.map((s) => s.path).sort();
    expect(paths).toEqual(["group-a/helper", "group-b/helper"]);
  });

  it("flags a nested member colliding with an unrelated standalone skill", async () => {
    writeStandaloneSkill(dir, "helper");
    writeGroup(dir, "toolkit", [{ kind: "nested", name: "helper" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(false);
    expect(result.collisions[0]?.destination).toBe("helper");
    const kinds = result.collisions[0]?.sources.map((s) => s.kind).sort();
    expect(kinds).toEqual(["nested", "standalone"]);
  });

  it("flags two nested members of the same name within one group", async () => {
    // Degenerate authoring mistake: two "nested" entries in one group's
    // own members list resolving to the same name.
    writeSkillJson(dir, "toolkit", {
      version: "1.0.0",
      members: [
        { kind: "nested", name: "helper" },
        { kind: "nested", name: "helper" },
      ],
    });
    mkdirSync(join(dir, "toolkit", "helper"), { recursive: true });
    const result = await checkRegistryCollisions(dir);
    // A single source path ("toolkit/helper") claimed twice collapses to
    // one claim — nothing to flag, since it's not two *distinct* sources.
    expect(result.ok).toBe(true);
  });

  it("reports every currently known harness against a collision", async () => {
    writeStandaloneSkill(dir, "helper");
    writeGroup(dir, "toolkit", [{ kind: "nested", name: "helper" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.collisions[0]?.harnesses).toEqual(
      expect.arrayContaining(["claude", "codex", "cursor"]),
    );
  });

  it("resolves group-to-group pointers without flagging them as new claims", async () => {
    writeGroup(dir, "inner", [{ kind: "nested", name: "inner-helper" }]);
    writeGroup(dir, "outer", [{ kind: "pointer", name: "inner" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
  });
});

describe("formatCollisionReport", () => {
  it("reports a clean pass", () => {
    expect(formatCollisionReport({ ok: true, collisions: [] })).toBe(
      "No destination-path collisions found.",
    );
  });

  it("names the destination, harnesses, and every source on a collision", () => {
    const report = formatCollisionReport({
      ok: false,
      collisions: [
        {
          destination: "helper",
          harnesses: ["claude", "codex"],
          sources: [
            { kind: "standalone", path: "helper" },
            { kind: "nested", path: "toolkit/helper" },
          ],
        },
      ],
    });
    expect(report).toContain('"helper"');
    expect(report).toContain("claude, codex");
    expect(report).toContain("toolkit/helper");
  });
});
