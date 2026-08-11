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
      skillsDir: ".codex/skills",
    });
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
