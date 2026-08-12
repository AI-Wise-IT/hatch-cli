import { describe, expect, it } from "vitest";
import { parseImportTarget, pinsEqual, resolvePin } from "./pin-spec.js";

describe("parseImportTarget", () => {
  it("parses a bare name with no spec", () => {
    expect(parseImportTarget("hatch-usage")).toEqual({
      name: "hatch-usage",
      spec: { kind: "none" },
    });
  });

  it("parses an exact version pin", () => {
    expect(parseImportTarget("hatch-usage@1.2.3")).toEqual({
      name: "hatch-usage",
      spec: { kind: "exact", value: "1.2.3" },
    });
  });

  it("parses a range/floor pin", () => {
    expect(parseImportTarget("hatch-usage@^1.2.3")).toEqual({
      name: "hatch-usage",
      spec: { kind: "range", value: "1.2.3" },
    });
  });

  it("parses the literal 'latest' as an explicit unpin", () => {
    expect(parseImportTarget("hatch-usage@latest")).toEqual({
      name: "hatch-usage",
      spec: { kind: "latest" },
    });
  });

  it("splits on the LAST '@' in the argument", () => {
    // No registry name contains "@" today, but the rule should still be
    // the last occurrence (0020's own npm-scoped-package precedent).
    expect(parseImportTarget("weird@name@1.0.0")).toEqual({
      name: "weird@name",
      spec: { kind: "exact", value: "1.0.0" },
    });
  });
});

describe("resolvePin", () => {
  it("leaves an existing pin unchanged for a bare re-import (kind: none)", () => {
    const existing = { type: "range" as const, value: "1.0.0" };
    expect(resolvePin({ kind: "none" }, existing)).toBe(existing);
  });

  it("clears the pin for @latest", () => {
    expect(
      resolvePin({ kind: "latest" }, { type: "exact", value: "1.0.0" }),
    ).toBeUndefined();
  });

  it("records an exact pin", () => {
    expect(resolvePin({ kind: "exact", value: "2.0.0" }, undefined)).toEqual({
      type: "exact",
      value: "2.0.0",
    });
  });

  it("records a range pin", () => {
    expect(resolvePin({ kind: "range", value: "2.0.0" }, undefined)).toEqual({
      type: "range",
      value: "2.0.0",
    });
  });
});

describe("pinsEqual", () => {
  it("treats two undefined pins as equal", () => {
    expect(pinsEqual(undefined, undefined)).toBe(true);
  });

  it("treats one undefined and one set pin as unequal", () => {
    expect(pinsEqual(undefined, { type: "exact", value: "1.0.0" })).toBe(false);
  });

  it("compares type and value", () => {
    expect(
      pinsEqual(
        { type: "exact", value: "1.0.0" },
        { type: "exact", value: "1.0.0" },
      ),
    ).toBe(true);
    expect(
      pinsEqual(
        { type: "exact", value: "1.0.0" },
        { type: "range", value: "1.0.0" },
      ),
    ).toBe(false);
  });
});
