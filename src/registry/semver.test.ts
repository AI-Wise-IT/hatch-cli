import { describe, expect, it } from "vitest";
import { compareVersions, isNewerCompatible } from "./semver.js";

describe("compareVersions", () => {
  it("orders by MAJOR, then MINOR, then PATCH", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("isNewerCompatible", () => {
  it("is true for a same-MAJOR, higher MINOR or PATCH version", () => {
    expect(isNewerCompatible("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerCompatible("1.0.0", "1.1.0")).toBe(true);
  });

  it("is false for the same version", () => {
    expect(isNewerCompatible("1.0.0", "1.0.0")).toBe(false);
  });

  it("is false across a MAJOR version bump — never auto-applied (ADR-0009)", () => {
    expect(isNewerCompatible("1.0.0", "2.0.0")).toBe(false);
  });

  it("is false when the candidate is older", () => {
    expect(isNewerCompatible("1.5.0", "1.4.0")).toBe(false);
  });
});
