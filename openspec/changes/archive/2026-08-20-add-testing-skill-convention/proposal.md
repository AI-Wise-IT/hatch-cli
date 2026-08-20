## Why

The registry holds twelve folders that exist only to exercise the CLI — `_reimport-fixture`, `_removed-fixture`, `_group-fixture-*`, `_harness-suffix-fixture`, `_collision-check-fixture-*`, `_registry-integrity-fixture`. They already share a de-facto `_` prefix, but no rule anywhere says what that prefix means, so the system treats them as real published content: [ADR-0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)'s name-permanence rule locks their names forever, and `hatch import _reimport-fixture` would place test scaffolding into any real project that asked for it.

Both consequences are wrong for content whose only job is to be thrown at the CLI. Permanence exists to protect projects that depend on a name — nothing should ever depend on a fixture, and fixtures need to be freely renamed and deleted as the test surface moves. The pre-launch audit surfaced this directly: every one of those twelve folders was classified "keep" purely because it is cited in a verification section, and the audit had no category for "this is test scaffolding, permanence does not apply."

Doing this before launch is the point. Once the name-permanence check flips to blocking at the hardening cutover, every fixture name in the registry is locked forever and this convention can no longer be applied retroactively.

## What Changes

- **Every top-level folder declares its classification.** `testing` becomes a mandatory boolean on every `skill.json` in the registry: real content declares `"testing": false`, testing content declares `"testing": true`. Registry CI rejects an omitted or non-boolean field, so nothing can enter the registry unclassified and a fixture can never be published as importable content by omission.
- **A testing skill is a registry folder marked two ways at once.** Its top-level folder name starts with `_`, **and** its `skill.json` declares `"testing": true`. Registry CI cross-validates the pair: a `_`-prefixed folder declaring `false`, or a folder declaring `true` without the prefix, fails the check. `_` becomes a reserved leading character — no real skill or group may use it.
- **Testing skills are exempt from the name-permanence rule.** They may be renamed and deleted through an ordinary PR, forever — before and after the pre-launch cutover. The permanence rule continues to apply, unchanged, to every folder without the marker.
- **A real published folder can never become a testing skill.** The marker includes the folder name, and renaming a real folder is forbidden — so laundering published content out of the permanence rule is structurally impossible rather than merely disallowed. Promotion in the other direction (fixture → real skill) means publishing a new, unprefixed folder; the fixture stays behind and remains deletable.
- **To a project that has not opted in, testing content does not exist.** `hatch import` fails — exit failure, nothing placed, no manifest change, no commit — reporting the target with the registry's ordinary "not found" wording. The output never says the content is testing content, never hints that it exists, and never names the opt-in. The check runs after authentication, at the point resolution would report a missing name, so an unauthenticated caller authenticates first exactly as it would for any other import. Both markers are consulted — the name before the fetch, the declaration on the fetched `skill.json` — and a pointer at testing content fails a group import exactly as a pointer at a nonexistent name does. A version published before this convention carries no declaration and stays importable: absence reads as ordinary content in the CLI, even though CI now requires the field on every new publish.
- **The project manifest gains an optional `testProject` boolean** (schema v3 → v4, additive, identity migration per [ADR-0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md)'s existing precedent). A project with `testProject: true` may import testing skills; every other project may not. `hatch init --test-project` sets it. This is documented in the spec and ADR and left out of the README and the user-facing command summary — not concealed, just not advertised, and never named in the refusal message.
- **A non-testing group may not list a testing skill as a member.** Enforced in registry CI, with the CLI failing such a pointer at resolution time as the runtime backstop.
- **Testing skills keep claiming destination names in the collision check.** [ADR-0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md)/[ADR-0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md)'s namespace is unchanged — one destination, one source, testing or not — so the guarantee keeps no holes and `_collision-check-fixture-a`/`-b`'s deliberate near-miss keeps meaning what it means.
- **Testing skills keep their version-bump requirement.** The blocking `version-check` job applies to them exactly as today; several fixtures depend on their own published `<name>@<version>` tags to test pinning.
- **The name-permanence check's live proof moves into a unit test.** `check-name-permanence.mjs` gets tested directly against synthetic git history (delete a name → assert non-zero in block mode; delete a `_`-marked name → assert zero). `_registry-integrity-fixture`, whose entire purpose was to be a permanently-undeletable folder proving that check works, is then deleted — the exemption makes it both possible and pointless to keep.

## Capabilities

`openspec/specs/` now holds `project-initialization` and `version-control-integration`, seeded when the previous change was archived. This change adds one further capability rather than modifying either of them: the `--test-project` flag it adds to `hatch init` sits alongside that capability's rules without changing any of them (nothing there constrains additional flags beyond forbidding one that would skip the self-documentation skill).

### New Capabilities

- `testing-skill-convention`: what marks a registry folder as a testing skill, the registry-side rules that follow (permanence exemption, marker consistency, group-membership restriction, unchanged collision and versioning treatment, one-way promotion), and the CLI-side rule that a testing skill is never importable into a project that is not marked a test project — including the manifest field that marks one.

### Modified Capabilities

None — `project-initialization`'s existing requirements are unchanged by the flag this adds to `hatch init`, so it needs no delta.

## Impact

**Code (`hatch-cli`)**
- `src/registry/testing-skill.ts` (new) — the shared classification: an I/O-free predicate over a name, plus the declaration check applied to a fetched `skill.json`. It exposes no message of its own.
- `src/commands/import.ts` — the two not-found message shapes extracted into shared helpers, and both refusals (the name before the fetch, the declaration after it) routed through them so they are identical to a genuine miss; all gated on the manifest's `testProject`.
- `src/registry/group-resolve.ts` — parses `testing` off each pointer target's `skill.json` and fails such a pointer as an ordinary missing target, which import's existing atomic abort already handles.
- `src/commands/init.ts` — `--test-project` flag writing `testProject: true`.
- `src/manifest-migrations/index.ts` — v3 → v4 identity migration; `CURRENT_SCHEMA_VERSION` becomes 4.

**Architecture decisions**
- New ADR — the testing-skill convention itself (dual marker, exemption, non-importability, opt-in).
- [0013-registry-group-structure-and-permanence](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) — its permanence rule, Agent Rules, Invariants and Machine Check all currently read "every top-level folder, no exceptions"; each needs the exemption folded in.
- [0010-manifest-schema-migrations](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md) — the v4 entry in the chain.

**Cross-repo (`AI-Wise-IT/hatch-skills`)**
- `scripts/check-name-permanence.mjs` — skip marked folders; new unit test alongside it (`node --test`, no new dependency).
- Marker-consistency and group-membership checks — new CI enforcement.
- All fifteen top-level folders gain the field — `"testing": true` on the twelve fixtures (including `_registry-integrity-fixture`, declared before it is deleted so the check never sees an undeclared folder), `"testing": false` on `hatch-usage`, `prd-elicitation` and `architecture-decisions` — each with the PATCH bump `version-check` requires. Existing tags are untouched, so the pin fixtures (`_group-fixture-versioned`, `_reimport-fixture`, `_harness-suffix-fixture-cld`) keep testing what they test.
- `_registry-integrity-fixture` deleted once its unit-test replacement is green.
- `README.md` — documents the convention for anyone authoring registry content (private repo).

**Documentation**
- `docs/pre-launch-audit.md` is a snapshot, not a log — it is left alone, but its §5 classification is superseded the moment this lands (every `_` folder becomes freely removable rather than "keep"). A re-run belongs to the hardening pass, not to this change.

**Out of scope**
- Flipping `NAME_PERMANENCE_ENFORCEMENT` to `block` — that is the hardening cutover's decision, and this change deliberately lands before it.
- Any `hatch list`/`search` surface that would need to hide testing skills from discovery — no such command exists.
- Removing or rewriting the fixtures themselves beyond adding the marker, and the registry-side "which groups depend on a removed skill" check already logged in [intake/backlog-0001](../../../intake/backlog-0001-clean-command-and-removed-dependency-check.md).
