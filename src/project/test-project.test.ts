import { describe, expect, it } from "vitest";
import { migrateManifest } from "../manifest-migrations/index.js";
import { isTestProject } from "./test-project.js";

describe("isTestProject", () => {
  it("is true only for an explicit testProject: true", () => {
    expect(isTestProject({ testProject: true })).toBe(true);
  });

  it("treats an absent field as an ordinary project", () => {
    expect(isTestProject({})).toBe(false);
  });

  it("treats false as an ordinary project", () => {
    expect(isTestProject({ testProject: false })).toBe(false);
  });

  it("treats a non-boolean value as an ordinary project", () => {
    expect(isTestProject({ testProject: "true" })).toBe(false);
    expect(isTestProject({ testProject: 1 })).toBe(false);
    expect(isTestProject({ testProject: null })).toBe(false);
  });

  it("reads the flag through a migrated older manifest", () => {
    const migrated = migrateManifest({
      schemaVersion: 3,
      harnesses: ["claude"],
      skills: {},
      testProject: true,
    });
    expect(isTestProject(migrated)).toBe(true);
  });

  it("reads a pre-existing manifest with no flag as an ordinary project", () => {
    const migrated = migrateManifest({
      schemaVersion: 1,
      harnesses: ["claude"],
      skills: {},
    });
    expect(isTestProject(migrated)).toBe(false);
  });
});
