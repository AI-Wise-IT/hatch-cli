# Group pointer version constraints: exact pin or caret, resolved before a no-op

## Metadata

- **id:** 0032-group-pointer-caret-constraint
- **component:** skill-registry-group-structure
- **status:** accepted
- **applies_to:** every group folder's `skill.json` in the skill-content repo (hatch-skills); `hatch import`'s member parsing, version resolution and re-import no-op decision in the Hatch CLI
- **decision_record:** `docs/architecture/decisions/0032-group-pointer-caret-constraint.md`
- **supersedes:** 0016-group-member-manifest-format

## Decision

A group pointer member's `version` field takes exactly one of two forms, and any other value is a malformed manifest:

- `"X.Y.Z"` — an exact pin, resolved via the `<name>@<version>` git tag ([0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md)), exactly as [0016-group-member-manifest-format](0016-group-member-manifest-format.md) established.
- `"^X.Y.Z"` — a caret constraint, resolving to the highest published version whose MAJOR equals the constraint's MAJOR and which is not below the constraint's floor. It never resolves into another MAJOR. When no published version satisfies it, the import aborts.

An omitted `version` continues to mean latest on `main`, unconstrained, unchanged from 0016.

The caret is spelled as `hatch import <name>@^<version>` already spells it ([0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md)). What it carries differs by level, and deliberately: a standalone import takes its MAJOR bound from the version recorded in the project manifest, so its caret floor is recorded and inert for resolution. A group pointer is resolved fresh on every unpack and never recorded, so it has no such anchor and the caret supplies the MAJOR bound itself. On a group pointer the floor is therefore a real lower bound, not a note.

A version constraint is classified while the member list is parsed, before any content is fetched on that member's behalf. A `nested` member declares no `version` at all.

Every constraint on a name reduces to a concrete version *before* the pinned-pointer conflict rule runs, so that rule ([0016](0016-group-member-manifest-format.md), AF-9) operates unchanged on concrete versions: an unconstrained path expresses no opinion, constraints resolving within one MAJOR yield the highest with a warning, and constraints resolving across MAJORs abort the import.

A re-import of a group resolves its member graph **before** deciding the project is already up to date. An unchanged group version does not imply unchanged members. This holds for every group, whatever constraint forms its members declare.

## Context

[0016-group-member-manifest-format](0016-group-member-manifest-format.md) gave a pointer member two resolution modes: omitted `version` meaning latest on `main`, and a present `version` meaning an exact pin. Neither fits a member a group genuinely depends on. Unpinned crosses a MAJOR boundary the moment a breaking version is published, unattended, for every importer. Exactly pinned freezes the member until someone hand-edits the manifest and cuts a release.

The gap is live. Three project-material groups in `hatch-skills` each point at `prime-expert-context`, which they invoke to derive their record methodology. They need its improvements and must never take a breaking rewrite without a human deciding to. 0016 offers only "always break eventually" or "never improve".

Latest-within-MAJOR is already this project's behavior everywhere else, in code and not only in prose: `isNewerCompatible` in `src/registry/semver.ts` refuses to treat a new MAJOR as an auto-appliable update ([0009](0009-skill-versioning-semver-tags.md)), and every non-exact standalone re-import is gated through it. The group pointer was the one place that behavior was unavailable.

The no-op half of this record was forced by implementation. The group-level AF-1 gate returned before resolving anything when the group's own version was unchanged, reasoning that a member list can only change if the group's version changes. A caret falsifies that: it resolves against the registry's current tags, so a member moves while the group stands still — which is the whole point of the feature. Left alone, an improvement to a pointed-at skill would reach nobody until every referencing group cut a release, the manual step this record exists to remove.

## Alternatives Considered

- **Spell the constraint `"1.x"`.** Unambiguous against `X.Y.Z` and needs no floor. Rejected: it invents a second spelling for a concept this project already spells with a caret, and two spellings for one idea costs more than the floor asymmetry above.
- **Spell it as a bare `"1"`.** Terser still, rejected for the same reason, with the added problem that it reads as a truncated version and a mistyped `"1.0"` would be rejected with no obvious cause.
- **Carry it in a separate `"major": 1` field.** Most explicit to read. Rejected on failure mode: [0016](0016-group-member-manifest-format.md)'s invariant records that a group's `skill.json` carries no `schemaVersion`, so an older CLI meeting an unknown field would ignore it, see no `version`, and resolve from `main` — silently doing the one thing the group declared must never happen. A spelling inside `version` fails loudly instead, because an older CLI passes it through as a git ref and finds no such tag.
- **Discover versions by listing all tags and filtering locally.** Simplest to write. Rejected: the registry accumulates one tag per version per folder forever, so resolving one member would cost a walk of every release the registry has ever cut.
- **Read the current `skill.json` from `main` and use its version when the MAJOR matches.** No new API surface. Rejected: it cannot find the newest `1.y.z` once `2.0.0` has landed on `main`, which is the case the feature exists for.
- **Skip the re-import gate only for a group with at least one caret member.** Cheapest correct option — the group's `skill.json` is already in hand at that point, so detecting a caret costs no extra request, and groups that never opt in keep their current cost. Rejected by the developer in favor of one rule that holds for every group.
- **Leave the re-import gate alone.** Rejected: carets would take effect only when a group re-versions, leaving the motivating problem unsolved.

## Trade-offs Accepted

- **Prompt coherence:** high — one spelling means the same thing at both levels, so an agent reading `^1.2.0` in a group manifest and `@^1.2.0` on a command line reads one concept, not two.
- **Failure surface:** a malformed constraint now fails at manifest parse naming the group and the entry index, where it previously passed through and surfaced as a `not-found` on a tag nobody meant to request. An older CLI meeting `"^1.2.0"` reports that same confusing `not-found`; this is the least-bad failure available under 0016's no-`schemaVersion` invariant, and is preferred to a silent MAJOR jump.
- **Cost:** every group re-import now pays a full member resolution, where it previously paid a single `skill.json` read. Accepted in exchange for one rule that holds for every group. Version discovery adds one prefix-matched ref query per caret-constrained name, memoized for the run; unconstrained and exactly-pinned members add no calls.
- **Reversibility:** high for the grammar — it is additive, and every already-published group keeps its exact current behavior. Lower for the no-op change, which alters AF-1's meaning for all groups.
- **Residual risk:** a caret takes a minor release with a behavioral regression unattended. Inherent to the mode, which is why it is opt-in per member; the import summary reports resolved versions, so the change lands visibly in the commit.

## Consequences

- `src/registry/semver.ts` owns the constraint grammar and caret resolution; `src/registry/fetch.ts` gains a prefix-matched tag query, the first registry read that enumerates refs rather than fetching a known path.
- `src/registry/group-resolve.ts` classifies each member's constraint at parse time and reduces it to a concrete version before the existing conflict reconciliation, which is untouched.
- `src/commands/import.ts` resolves a group's member graph on every re-import and reports the no-op as a conclusion from that resolution rather than an assumption from the group's own version.
- `docs/use-cases/import-content.md` must state all three constraint forms, and its AF-1/AF-2 description of group re-import no longer holds as written.
- A group in `hatch-skills` may adopt `"^X.Y.Z"` only after a CLI carrying this record is released; adopting earlier breaks importers on the released version.

## Agent Rules

- MUST accept exactly two forms for a pointer member's `version`: `X.Y.Z` and `^X.Y.Z` — MUST reject every other value, including `1`, `1.0`, `^1`, `^1.2`, `~1.2.0`, `1.x` and `v1.2.0`.
- MUST classify a pointer member's `version` while parsing the member list, before fetching any content on that member's behalf.
- MUST resolve `^X.Y.Z` to the highest published version sharing its MAJOR and at or above its floor — MUST NOT resolve into any other MAJOR, and MUST abort the import when no published version satisfies it.
- MUST reject a `version` declared on a `nested` member.
- MUST reduce every constraint to a concrete version before applying the pinned-pointer conflict rule — MUST NOT add cases inside that rule.
- MUST resolve a group's member graph before reporting a re-import as already up to date, for every group regardless of the constraint forms its members declare — MUST NOT infer from an unchanged group version that no member changed.
- MUST NOT record a group's internal pointer constraint as a sticky project-level pin; it is resolved fresh on every unpack.

## Invariants

- **The two accepted spellings of a pointer member's `version`.** Becomes irreversible once any group published in `hatch-skills` carries `^X.Y.Z` and importers depend on the CLI reading it: changing the spelling afterwards would make every such group unreadable to released clients, and a group's `skill.json` carries no `schemaVersion` to negotiate with ([0016](0016-group-member-manifest-format.md)). Enforcement mechanism: the `decision-records` job in `hatch-cli`, executing this record's Machine Check on every pull request. Current mode: **blocking** — it protects the readability of a shared published artifact rather than a pre-launch cleanup window, so it blocks from the day it lands.
- **A caret never resolving outside its MAJOR.** Becomes irreversible the moment a published group relies on it to withhold a breaking version from importers: widening it later would deliver exactly the unattended MAJOR jump the constraint exists to prevent, to every project that already imported that group. Enforcement mechanism: the same `decision-records` job, via the resolution assertions this record's Machine Check executes. Current mode: **blocking**.

## Machine Check

- **context:** cli-repo

The grammar and resolution rules above are behavioral, so the check executes the suites that assert them: the constraint grammar and caret resolution in `src/registry`, and the group re-import no-op decision in `src/commands`. A regression in any Agent Rule above fails at least one of these.

```bash
npx vitest run src/registry/semver.test.ts src/registry/group-resolve-constraints.test.ts src/commands/import.test.ts
```

Expected result: all three files pass, exit 0. A change that widens the accepted grammar, lets a caret cross a MAJOR, drops the floor check, or restores the pre-resolution group no-op fails at least one assertion and exits non-zero.

## Precedence

- **Supersedes [0016-group-member-manifest-format](0016-group-member-manifest-format.md)**, whose Decision states that a pointer's `version` "present means an exact pin". That reading no longer holds. Everything else 0016 settled stands and is restated here only where this record changes it: the `members` array lives on the group's own `skill.json`, entries are distinguished by `kind`, an omitted `version` means latest on `main`, and a pointer may reference another group at arbitrary depth.
- Builds on [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) for the `<name>@<version>` tag mechanism and the same-MAJOR definition of an auto-appliable update, and on [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) for group-to-group pointers and the visited-set dedup.
- Borrows its spelling from [0020-standalone-version-pin-manifest-and-parsing](0020-standalone-version-pin-manifest-and-parsing.md) without changing it. A standalone import's pin remains a distinct mechanism: recorded in the project manifest and sticky, where a group's constraint is resolved fresh and never recorded.
- No other conflicting decision records.
