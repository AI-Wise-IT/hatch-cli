import { describe, expect, it } from "vitest";
import {
  getHarnessDefinition,
  isKnownHarness,
  knownHarnessNames,
  resolveSkillFolderName,
} from "./harness-registry.js";

describe("harness-registry", () => {
  it("knows the registered harnesses", () => {
    expect(knownHarnessNames().sort()).toEqual(["claude", "codex", "cursor"]);
  });

  it("validates harness names", () => {
    expect(isKnownHarness("claude")).toBe(true);
    expect(isKnownHarness("nonexistent")).toBe(false);
  });

  it("exposes each harness's code and skills directory", () => {
    expect(getHarnessDefinition("codex")).toEqual({
      code: "cdx",
      skillsDir: ".agents/skills",
      previousSkillsDir: ".codex/skills",
    });
    expect(getHarnessDefinition("codex").skillsDir).toBe(".agents/skills");
  });

  // A harness's directory is registry data, independent of its reserved code
  // (ADR-0033): codex's directory moved, its code did not move with it.
  it("keeps a harness's reserved code independent of its directory", () => {
    expect(getHarnessDefinition("claude").code).toBe("cld");
    expect(getHarnessDefinition("codex").code).toBe("cdx");
    expect(getHarnessDefinition("cursor").code).toBe("csr");
  });

  it("names the directory a moved harness previously occupied", () => {
    expect(getHarnessDefinition("codex").previousSkillsDir).toBe(
      ".codex/skills",
    );
  });

  it("leaves the previous directory absent for a harness that never moved", () => {
    expect(getHarnessDefinition("claude")).toEqual({
      code: "cld",
      skillsDir: ".claude/skills",
    });
    expect(getHarnessDefinition("claude").previousSkillsDir).toBeUndefined();
    expect(getHarnessDefinition("cursor")).toEqual({
      code: "csr",
      skillsDir: ".cursor/skills",
    });
    expect(getHarnessDefinition("cursor").previousSkillsDir).toBeUndefined();
  });

  it("throws for an unknown harness", () => {
    expect(() => getHarnessDefinition("nonexistent")).toThrow(
      /Unknown harness/,
    );
  });

  describe("resolveSkillFolderName", () => {
    it("prefers the harness-suffixed variant when it exists", async () => {
      const existing = new Set(["handover-cdx", "handover"]);
      const result = await resolveSkillFolderName(
        "handover",
        "codex",
        async (name) => existing.has(name),
      );
      expect(result).toBe("handover-cdx");
    });

    it("falls back to the unsuffixed default", async () => {
      const existing = new Set(["handover"]);
      const result = await resolveSkillFolderName(
        "handover",
        "codex",
        async (name) => existing.has(name),
      );
      expect(result).toBe("handover");
    });

    it("reports unavailable when neither variant exists", async () => {
      const result = await resolveSkillFolderName(
        "handover",
        "codex",
        async () => false,
      );
      expect(result).toBeUndefined();
    });
  });
});
