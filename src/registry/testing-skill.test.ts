import { describe, expect, it } from "vitest";
import { declaresTesting, isTestingSkillName } from "./testing-skill.js";

describe("isTestingSkillName", () => {
  it("classifies a `_`-prefixed name as testing content", () => {
    expect(isTestingSkillName("_reimport-fixture")).toBe(true);
    expect(isTestingSkillName("_group-fixture-combo")).toBe(true);
  });

  it("classifies a harness-suffixed testing name as testing content", () => {
    expect(isTestingSkillName("_harness-suffix-fixture-cld")).toBe(true);
  });

  it("never classifies a name without a leading underscore as testing", () => {
    expect(isTestingSkillName("prd-elicitation")).toBe(false);
    expect(isTestingSkillName("hatch-usage")).toBe(false);
    expect(isTestingSkillName("architecture-decisions")).toBe(false);
    // Underscores anywhere but the front carry no meaning.
    expect(isTestingSkillName("some_fixture")).toBe(false);
    expect(isTestingSkillName("fixture_")).toBe(false);
  });
});

describe("declaresTesting", () => {
  it("is true only for a literal `true`", () => {
    expect(declaresTesting({ testing: true })).toBe(true);
  });

  it("reads an absent field as ordinary content", () => {
    expect(declaresTesting({})).toBe(false);
  });

  it("reads `false` as ordinary content", () => {
    expect(declaresTesting({ testing: false })).toBe(false);
  });

  it("reads a non-boolean value as ordinary content rather than raising", () => {
    expect(declaresTesting({ testing: "true" })).toBe(false);
    expect(declaresTesting({ testing: 1 })).toBe(false);
    expect(declaresTesting({ testing: null })).toBe(false);
  });
});
