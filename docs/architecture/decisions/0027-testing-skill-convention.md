# Testing skills: a declared, `_`-prefixed class of registry content that is exempt from name permanence and never importable into an ordinary project

## Metadata

- **id:** 0027-testing-skill-convention
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** every top-level folder's `skill.json` in the skill-content repo (hatch-skills) and that repo's CI checks; `hatch import`'s target classification and group member-graph resolution (`src/commands/import.ts`, `src/registry/group-resolve.ts`, `src/registry/testing-skill.ts`); the project manifest's `testProject` field (`src/project/test-project.ts`, `src/commands/init.ts`)
- **decision_record:** `docs/architecture/decisions/0027-testing-skill-convention.md`

## Decision

Every top-level registry folder's `skill.json` carries a mandatory boolean `testing` field. Real content declares `"testing": false`; content that exists only to exercise the CLI declares `"testing": true`. The registry's CI rejects a folder that omits the field or gives it a non-boolean value, so nothing enters the registry unclassified.

A folder is a **testing skill** when its top-level name begins with `_` **and** its `skill.json` declares `"testing": true`. The two markers must agree: CI rejects a `_`-prefixed folder declaring `false`, and a folder declaring `true` without the prefix. The leading `_` is reserved — no real, importable skill or group may use it. The declaration binds top-level folders only; a group's nested member has no `skill.json` of its own and inherits its group's classification.

Three rules follow.

**Testing skills are exempt from name permanence.** [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s rule — a published top-level folder name is never deleted and never renamed — does not apply to them. A testing skill may be renamed or deleted through an ordinary pull request at any time, before or after the pre-launch hardening cutover. The rule continues to apply unchanged to every folder without the marker.

**Real content can never be reclassified as testing content.** Because the marker includes the folder name, marking published real content as a testing skill would require renaming it, which name permanence forbids. CI therefore rejects any change that flips an already-published folder's declaration from `false` to `true`. Promotion in the other direction — publishing a fixture's content as real content — is done by adding a new, unprefixed folder; the fixture stays behind and stays deletable. A group that is not itself a testing skill may not list a testing skill among its members, nested or pointer; a testing group may list either kind.

**To a project that has not opted in, testing content does not exist.** `hatch import` fails — exit failure, nothing placed, no manifest change, no commit — when the target is testing content and the project's manifest does not record `testProject: true`. The failure is reported with the registry's ordinary not-found wording and is indistinguishable from a name the registry does not have: it never states that the content is testing content, never reveals that it exists, and never names the opt-in.

Because indistinguishability is the point, the check runs **after** authentication, at the position where resolution would report a missing name — an unauthenticated caller is prompted for credentials exactly as any other import would prompt it, since a "not found" that skipped the prompt would itself identify the content. Both markers are consulted: the requested name before the fetch, and the fetched `skill.json`'s declaration as a backstop for content that reached the registry without the prefix. A pointer at testing content fails a group's resolution exactly as a pointer at a nonexistent name does, aborting the whole operation; a nested member needs no check, since it carries no `skill.json` and inherits its group's classification. A fetched `skill.json` carrying no `testing` field reads as ordinary content rather than as an error.

The opt-in is the project manifest's optional `testProject` boolean (schema v4, additive, identity migration per [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)), written by `hatch init --test-project` and carried across every subsequent rewrite of that manifest. Because `hatch init` never modifies an existing manifest, the flag cannot be applied retroactively; given for an already-initialized project it warns that it had no effect rather than being accepted silently. It is documented here and in the change's spec, and deliberately absent from the README, from any user-facing usage summary, and from every failure message — not concealed, just not advertised, and never discoverable by attempting an import.

Everything else about a testing skill is unchanged: it claims its destination name in [0014-registry-collision-detection](0014-registry-collision-detection.md)/[0024-registry-collision-predicate](0024-registry-collision-predicate.md)'s namespace exactly as real content does, its version bump is required by [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)'s blocking check exactly as for real content, and fetch, resolution, harness-suffix resolution, pinning and the `removed` flag all behave identically once an import is permitted.

## Context

Twelve of the fifteen top-level folders in `hatch-skills` exist only to exercise the CLI — `_reimport-fixture`, `_removed-fixture`, `_group-fixture-*`, `_harness-suffix-fixture`(`-cld`), `_collision-check-fixture-a`/`-b`, `_registry-integrity-fixture`. They already shared a de-facto `_` prefix, but no record gave that prefix meaning, so the system treated them as ordinary published content: [0013](0013-registry-group-structure-and-permanence.md)'s permanence rule locked their names forever, and nothing stopped `hatch import _reimport-fixture` from placing test scaffolding into a real project.

A pre-launch audit run on 2026-08-12 surfaced this directly. It classified all twelve fixtures as "keep" and found no purge candidates — each one was cited by name as verification evidence for a specific claim — while noting that the permanence rule is what makes those names permanent, and that the cleanup window is still open only because `name-permanence-check` is currently advisory (`NAME_PERMANENCE_ENFORCEMENT=warn`, `hatch-skills` PR #15). Once that check flips to blocking at the hardening cutover, every fixture name is locked forever and this convention could no longer be applied retroactively.

The developer confirmed each element of this record in conversation (this session), rather than any of it being inferred: the dual marker over a prefix-only or field-only scheme; the mandatory declaration on every folder, so that a forgotten field fails CI instead of silently producing importable content; the manifest opt-in over an unconditional block, so the existing end-to-end acceptance flows against real fixtures keep working; keeping testing skills inside the collision namespace; and keeping the post-fetch declaration backstop alongside the name check.

The same conversation settled what happens to `_registry-integrity-fixture`, whose entire purpose was to be a permanently-undeletable folder proving the permanence check works. Under this record it is a testing skill, so the check deliberately skips it and it can no longer demonstrate anything. Its role moves to a direct test of `check-name-permanence.mjs` against synthetic git history, after which the folder is deleted.

## Alternatives Considered

- **The `_` prefix alone as the marker.** Not chosen: a fixture's own manifest would say nothing about what it is, and [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) already set the precedent that status belongs in `skill.json`.
- **A `testing` field alone, with no reserved prefix.** Not chosen: the field cannot be read from a deleted path without an extra base-commit lookup, and it would make every refusal depend on a successful fetch, so a registry outage would change which failure a caller sees.
- **Requiring the field only on `_`-prefixed folders, absence meaning real content.** Not chosen: it makes the *safe* classification the one an author gets by forgetting. Someone who copies a fixture, drops the prefix and omits the field ends up with importable test scaffolding and no check that notices. Mandatory-everywhere turns that omission into a build failure.
- **Blocking testing-skill imports unconditionally, with no opt-in.** Not chosen: it would kill every end-to-end verification against real registry fixtures — `_reimport-fixture` (AF-1/2/3), `_removed-fixture` (AF-4/AF-13), `_harness-suffix-fixture` (harness resolution), `_group-fixture-*` (AF-9) exist precisely to be imported by hand.
- **A per-invocation escape hatch (an environment variable or hidden flag) instead of a manifest field.** Not chosen by the developer in favor of the per-project mark: a throwaway test project declares itself once, rather than every command in a walkthrough carrying an override.
- **Excluding testing skills from the destination-path collision check**, on the grounds that non-importable content claims no destination. Not chosen: it would put holes in [0014](0014-registry-collision-detection.md)'s guarantee, and the live registry could then never demonstrate a real collision being caught — the same problem the integrity fixture already had.
- **Refusing before authentication, with an explicit "this is testing content" message.** This is what the implementation did first, and the developer rejected it on review: authenticating first costs nothing, while an explicit message both advertises that the content exists and points the reader at the fact that some way of importing it must exist. Reporting the ordinary not-found result makes the content invisible rather than merely forbidden, which is the stronger property.
- **Keeping one non-marked folder permanently, as a live tripwire for the permanence check.** Not chosen: it would cost a permanently-locked name in the real, importable namespace for content that isn't real, when a direct test of the script covers the same ground on every pull request.

## Trade-offs Accepted

- **Prompt coherence:** high — "a `_`-prefixed folder declaring `testing: true` is test scaffolding: freely deletable, never importable" is one stateable rule, and the mandatory field means an agent never has to infer a classification from absence.
- **Failure surface:** the opt-in is not a security boundary — anyone can hand-edit `testProject: true` into their own manifest and import fixtures. Accepted deliberately: no failure message reveals the field, so nobody reaches it by accident, and the only project harmed is the one doing it. The cost of indistinguishability is that a registry author who can see the folder is told it was not found; that is the intended answer, and the registry README documents the convention for anyone it confuses. Two markers also mean two things that can disagree; CI's consistency check is what keeps that from reaching `main`.
- **Reversibility:** high for the mechanism (a predicate, a manifest field, and CI checks are ordinary code), and deliberately *low* in one direction — a folder published as real content can never become a testing skill, which is the property this record is buying.
- **Operational simplicity:** the CLI needs no new fetch (the declaration is read from the classify fetch `hatch import` already makes) and `check-collisions` needs no change at all; the cost is one more mandatory field on every future publish, and the version bumps to declare the fifteen folders that already exist.

## Consequences

- `hatch-skills`' CI needs a declaration check (mandatory boolean, whole-registry rather than diff-scoped), a marker-agreement check, and a group-membership check, alongside the existing `version-check` and `name-permanence-check`. All three are blocking from the day they land — none of them locks a name in, so none is a pre-launch invariant whose enforcement must wait for a cutover.
- `scripts/check-name-permanence.mjs` must skip marked folders, reading a deleted folder's classification from its state at the base commit, and must enforce the no-reclassification rule under the same `NAME_PERMANENCE_ENFORCEMENT` mode as the permanence rule itself — that rule *is* the permanence rule wearing a different hat.
- All fifteen existing top-level folders must declare the field, each with the version bump [0009](0009-skill-versioning-semver-tags.md)'s blocking check requires. The resulting tags are additive; the tags the pin fixtures depend on are untouched.
- `_registry-integrity-fixture` is deleted once `check-name-permanence.mjs` has direct test coverage.
- The project manifest gains `testProject`; `CURRENT_SCHEMA_VERSION` becomes 4. Every command that rewrites the manifest — `hatch import`, `hatch import --add-harness`, `hatch remove` — must carry the field across, since each rebuilds the manifest object from scratch.
- Any standing pre-launch artifact classification is superseded the moment this lands: the twelve fixtures stop being permanence-locked and become freely removable. A pre-launch audit is a snapshot of current state, so this is a re-run's job rather than an edit to a previous one.
- A registry discovery surface has to decide whether testing skills appear in listings; this record settles only that they cannot be imported. `openspec/changes/add-registry-listing/` takes that decision up, excluding them from an ordinary project's listing exactly as they are unimportable there.

## Agent Rules

- MUST give every top-level registry folder's `skill.json` a boolean `testing` field — MUST NOT publish a folder that omits it or gives it a non-boolean value.
- MUST treat a folder as a testing skill only when its name begins with `_` and its `skill.json` declares `"testing": true` — MUST NOT publish a folder whose two markers disagree.
- MUST NOT use a leading `_` in the name of any skill or group intended as real, importable content.
- MUST exempt testing skills from the name-permanence rule — renaming and deleting them through an ordinary pull request is permitted at all times.
- MUST NOT flip an already-published folder's declaration from `false` to `true`; publishing a fixture's content as real content MUST be done by adding a new, unprefixed folder.
- MUST NOT list a testing skill as a nested or pointer member of a group that is not itself a testing skill.
- MUST fail `hatch import` of testing content — nothing placed, no manifest change, no commit, non-zero exit — in any project whose manifest does not record `testProject: true`, consulting the requested name before the fetch and the fetched `skill.json`'s declaration after it.
- MUST report that failure with the same not-found wording used for a name the registry does not have — MUST NOT state that the target is testing content, reveal that it exists, or name the opt-in.
- MUST perform that check after authentication, so a caller without credentials is prompted exactly as any other import would prompt it.
- MUST abort the entire import when a group's pointer member names or resolves to testing content in a project that has not opted in, reporting it as a pointer whose target was not found.
- MUST treat a fetched `skill.json` with no `testing` field as ordinary content — MUST NOT raise an error for a version published before this record.
- MUST NOT name `testProject` or `--test-project` in any failure message, in the README, or in any user-facing usage summary — except in the warning that answers a caller who just typed the flag on an already-initialized project.
- MUST warn, without changing the exit code, when `hatch init` is given the opt-in flag for an already-initialized project that does not already record it — the flag cannot be applied retroactively, and accepting it silently would leave the caller believing it had.
- MUST carry `testProject` across every rewrite of a project manifest.
- MUST continue to count a testing skill's destination name in the collision check, and to require its version bump, exactly as for real content.

## Invariants

- **MUST NOT use a leading `_` in the name of any real, importable skill or group.** Becomes irreversible once: a real project has imported a `_`-prefixed name — the reservation would then be broken by content that projects already depend on, and the CLI's name-based refusal would start rejecting something real. Enforcement mechanism: `hatch-skills`' marker-agreement check (a `_`-prefixed folder declaring `testing: false` is rejected). Current mode: not-yet-built — blocking from the day it lands, since it locks no name in.
- **MUST NOT flip an already-published folder's declaration from `false` to `true`.** Becomes irreversible once: a real project has imported that name — reclassifying it would move a name projects depend on out of the permanence rule and make [0014](0014-registry-collision-detection.md)'s collision guarantee unsound, exactly as a rename would. Enforcement mechanism: `scripts/check-name-permanence.mjs`, gated on the same `NAME_PERMANENCE_ENFORCEMENT` mode as the permanence rule it protects. Current mode: not-yet-built; on landing it inherits **advisory** (`warn`) and moves to blocking at the same hardening cutover as [0013](0013-registry-group-structure-and-permanence.md)'s own rules, never independently.
- **MUST give every top-level folder a boolean `testing` field.** Becomes irreversible once: published content and the CLI's parser depend on the field's exact shape — switching to a richer classification later would have to handle every folder already published under this one, the same reasoning [0019](0019-registry-removed-metadata-flag.md) recorded for `removed`. Enforcement mechanism: `hatch-skills`' declaration check. Current mode: not-yet-built — blocking from the day it lands.
- **MUST carry `testProject` across every rewrite of a project manifest.** Becomes irreversible once: real projects record the field — a command that silently dropped it would break the next import in that project, and the loss is invisible until then. Enforcement mechanism: unit tests over each rewriting command (`hatch import`, `--add-harness`, `hatch remove`). Current mode: advisory — the tests detect a regression but nothing structurally prevents a fourth rewrite site from being added without the carry.

The remaining Agent Rules are not irreversibility-bearing: the import failures, the group-pointer abort, the tolerance of an absent field, and the message wording are all runtime behavior that can be changed in any release without invalidating anything already published.

## Machine Check

```bash
node -e "const{readdirSync,existsSync,readFileSync}=require('fs');const p=process.argv[1];let bad=[];for(const d of readdirSync(p,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.'))){const f=p+'/'+d.name+'/skill.json';if(!existsSync(f))continue;const t=JSON.parse(readFileSync(f,'utf8').replace(/^﻿/,'')).testing;if(typeof t!=='boolean')bad.push(d.name+': undeclared');else if(t!==d.name.startsWith('_'))bad.push(d.name+': markers disagree');}console.log(bad.length?bad.join('\n'):'OK');process.exit(bad.length?1:0)" ../hatch-skills
```

Expected result: `OK`, exit 0 — every top-level folder in the registry checkout declares a boolean `testing` that agrees with its name's prefix. Any output names a folder that is undeclared or whose two markers contradict each other.

## Precedence

- Narrows [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s name-permanence rule, which is stated there without exception, and adds the class of content that rule does not cover. That record stays accepted and governs every folder without the testing marker; this is the same narrowing relationship [0021-block-first-time-import-of-removed-target](0021-block-first-time-import-of-removed-target.md) has with [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md).
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) and [0016-group-member-manifest-format](0016-group-member-manifest-format.md) — the per-folder `skill.json` this field is added to, and the `members` list the group-membership rule reads.
- Follows [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md)'s precedent for status metadata on `skill.json`: one boolean, no enum, no separate index file.
- Extends [0010-manifest-schema-migrations](0010-manifest-schema-migrations.md)'s chain with the v3 → v4 identity migration for `testProject`.
- Leaves [0014-registry-collision-detection](0014-registry-collision-detection.md) and [0024-registry-collision-predicate](0024-registry-collision-predicate.md) untouched by design — testing skills stay in the same destination namespace, so neither record needs qualifying.
- No known conflicting decision records.
