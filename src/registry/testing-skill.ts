// Testing-skill classification (0027-testing-skill-convention.md): content
// that exists only to exercise the CLI, and is never placed into a project
// that hasn't marked itself a test project.
//
// A published testing skill carries two agreeing markers: a top-level
// folder name beginning with "_", and `"testing": true` in its own
// skill.json. Registry CI enforces that they agree and that every folder
// declares the field — so in a well-formed registry either marker answers
// the question. The CLI checks both anyway, at different moments:
//
//   - the name, before authentication and before any fetch, so the common
//     case costs no credential prompt and no network round trip;
//   - the declaration, on the skill.json `hatch import` already fetches to
//     tell a group from a plain skill, as a backstop for content that
//     somehow reached the registry without the prefix.
//
// An absent `testing` field reads as ordinary content rather than an error:
// every version published before this convention lacks it, and those
// versions stay reachable forever through exact and range pins.

const TESTING_NAME_PREFIX = "_";

// True when a top-level registry name is a testing skill by its name alone.
// Harness-suffixed variants (`_harness-suffix-fixture-cld`) resolve from the
// same base name, so the prefix answers for those too (ADR-0001).
export function isTestingSkillName(name: string): boolean {
  return name.startsWith(TESTING_NAME_PREFIX);
}

// True when a fetched skill.json declares itself testing content. Anything
// other than a literal `true` — absent, false, or a non-boolean written by
// hand — reads as ordinary content.
export function declaresTesting(meta: { testing?: unknown }): boolean {
  return meta.testing === true;
}

// This module deliberately exposes no message of its own. A refusal is
// reported with the registry's ordinary "not found" wording, built by the
// caller, so a project that has not opted in cannot distinguish testing
// content from content that does not exist.
