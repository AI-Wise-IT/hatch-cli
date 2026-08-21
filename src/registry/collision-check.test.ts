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
    writeStandaloneSkill(dir, "example-pointer-skill");
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

  it("reports a malformed skill.json as an actionable error instead of throwing", async () => {
    mkdirSync(join(dir, "broken"), { recursive: true });
    writeFileSync(join(dir, "broken", "skill.json"), "{not valid json", "utf8");
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(false);
    expect(result.collisions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.folder).toBe("broken");
    expect(result.errors[0]?.detail).toContain("not valid JSON");
  });

  it("strips a UTF-8 BOM before parsing skill.json (e.g. PowerShell's Set-Content -Encoding utf8)", async () => {
    mkdirSync(join(dir, "bom-fixture"), { recursive: true });
    writeFileSync(
      join(dir, "bom-fixture", "skill.json"),
      `${String.fromCharCode(0xfeff)}${JSON.stringify({ version: "1.0.0" })}`,
      "utf8",
    );
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("still detects real collisions alongside an unrelated malformed folder", async () => {
    mkdirSync(join(dir, "broken"), { recursive: true });
    writeFileSync(join(dir, "broken", "skill.json"), "not json", "utf8");
    writeStandaloneSkill(dir, "helper");
    writeGroup(dir, "toolkit", [{ kind: "nested", name: "helper" }]);
    const result = await checkRegistryCollisions(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.collisions).toHaveLength(1);
  });

  // 0027-testing-skill-convention.md: testing content stays in the same
  // destination namespace as everything else, so the guarantee keeps no
  // holes — testing skills simply can't be imported into an ordinary
  // project. This check needs no knowledge of the convention at all.
  it("flags a testing skill's destination colliding with another source", async () => {
    writeSkillJson(dir, "_fixture-group", {
      version: "1.0.0",
      testing: true,
      members: [{ kind: "nested", name: "helper" }],
    });
    mkdirSync(join(dir, "_fixture-group", "helper"), { recursive: true });
    writeStandaloneSkill(dir, "helper");

    const result = await checkRegistryCollisions(dir);

    expect(result.ok).toBe(false);
    expect(result.collisions[0]?.destination).toBe("helper");
    const paths = result.collisions[0]?.sources.map((s) => s.path).sort();
    expect(paths).toEqual(["_fixture-group/helper", "helper"]);
  });

  it("counts a testing standalone skill's own name as a destination", async () => {
    writeSkillJson(dir, "_reimport-fixture", {
      version: "1.0.0",
      testing: true,
    });
    writeGroup(dir, "toolkit", [{ kind: "nested", name: "_reimport-fixture" }]);

    const result = await checkRegistryCollisions(dir);

    expect(result.ok).toBe(false);
    expect(result.collisions[0]?.destination).toBe("_reimport-fixture");
  });
});

describe("formatCollisionReport", () => {
  it("reports a clean pass", () => {
    expect(
      formatCollisionReport({ ok: true, collisions: [], errors: [] }),
    ).toBe("No destination-path collisions found.");
  });

  it("names the destination, harnesses, and every source on a collision", () => {
    const report = formatCollisionReport({
      ok: false,
      errors: [],
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

  it("names the folder and reason on a read/parse error", () => {
    const report = formatCollisionReport({
      ok: false,
      collisions: [],
      errors: [{ folder: "broken", detail: "not valid JSON" }],
    });
    expect(report).toContain('"broken"');
    expect(report).toContain("not valid JSON");
  });
});
