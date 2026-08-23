import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isNewerCompatible,
  parseVersionConstraint,
} from "./semver.js";

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

describe("parseVersionConstraint", () => {
  it("reads a bare X.Y.Z as an exact pin", () => {
    expect(parseVersionConstraint("1.2.0")).toEqual({
      kind: "exact",
      version: "1.2.0",
    });
  });

  it("reads a caret as a MAJOR plus a floor within it", () => {
    expect(parseVersionConstraint("^1.2.0")).toEqual({
      kind: "caret",
      major: 1,
      floor: "1.2.0",
    });
  });

  it("reads a multi-digit MAJOR", () => {
    expect(parseVersionConstraint("^10.0.0")).toEqual({
      kind: "caret",
      major: 10,
      floor: "10.0.0",
    });
  });

  it.each([
    ["1", "a bare MAJOR"],
    ["1.0", "a truncated version"],
    ["^1", "a caret on a bare MAJOR"],
    ["^1.2", "a caret on a truncated version"],
    ["~1.2.0", "a tilde range"],
    ["1.x", "a wildcard"],
    ["v1.2.0", "a v-prefixed version"],
    ["", "an empty string"],
  ])("rejects %s (%s)", (raw) => {
    expect(parseVersionConstraint(raw)).toBeUndefined();
  });
});
