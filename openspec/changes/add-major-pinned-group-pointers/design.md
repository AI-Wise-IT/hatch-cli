## Context

See `proposal.md` — Why, for the motivation. The constraints that shape the approach:

- A pointer's `version` is currently validated only as "a string when present" and passed through verbatim as a git ref. There is no grammar to extend — there is a grammar to introduce.
- Registry reads are GitHub Contents API calls at a known path, optionally with `?ref=`. The CLI has never enumerated refs. Resolving "newest within a MAJOR" requires knowing which versions exist, which is a new kind of read.
- Reconciliation of a name reached by several pointer paths already exists: exact pins sharing a MAJOR resolve to the highest with a warning, differing MAJORs abort. Unconstrained paths are already ignored when any pin is present.
- ADR-0016 records an explicit invariant that a group's `skill.json` carries no `schemaVersion`, so there is no negotiated fallback when the member-entry shape changes. Whatever form the new constraint takes, an older CLI will meet it without being told it is new.
- The standalone pin behavior this change borrows its spelling from was read from code, not from `docs/use-cases/import-content.md`, which is an MVP-scope artifact and has drifted. AF-12 states that an unpinned standalone import resolves to "latest compatible, same MAJOR"; in code the MAJOR bound comes from `isNewerCompatible` against the version recorded in the manifest, so it applies to a re-import and not to a first import, which has no recorded version and takes whatever is on `main`. Correcting that statement is in scope for this change's documentation pass.

## Goals / Non-Goals

**Goals:**

- A group can express "track this member forward, but never across a MAJOR boundary" in its own manifest, with no project-side configuration.
- An older CLI meeting the new form fails loudly rather than resolving to something the group did not ask for.
- The existing reconciliation rule is extended, not replaced — one new step, not a new algorithm.

**Non-Goals:**

- Full semver range support (`>=`, `<`, `||`, pre-release channels). One constraint form is being added, not a range grammar.
- Changing standalone import pin semantics (`hatch import name@1.2.0`, `@^1.2.0`). Those are a separate mechanism and keep their current behavior; this change borrows their spelling, not their implementation.
- Constraining a *nested* member. Nested content ships inside the group at the group's own version and has no version of its own to constrain.

## Decisions

### Spell the constraint with the caret, the same as a standalone pin

**Chosen:** `"version": "^1.2.0"` — a caret followed by a full `X.Y.Z` version, the same spelling `hatch import <name>@^<version>` already uses. Exact pins keep the bare `X.Y.Z` form. Anything else is rejected.

Latest-within-MAJOR is already this project's house behaviour, in code rather than only in prose: `isNewerCompatible` in `src/registry/semver.ts` returns false across a MAJOR change — "a new MAJOR is never treated as an auto-appliable update" — and every non-exact re-import is gated through it. A group pointer is the one place that behaviour is unavailable, and the caret is the spelling the project already uses for it.

What the caret must carry differs between the two levels, and this is the substance of the decision rather than an inconsistency in it. At the standalone level the MAJOR bound comes from the version recorded in the project manifest, so the caret's floor is recorded for visibility and is inert for resolution (`fetchRef` is set only for an exact pin; `range` and `none` both fetch `main`). A group pointer has no recorded version — it is resolved fresh on every unpack and never written to the manifest — so there is no anchor for "compatible" to mean anything against. The caret supplies that anchor directly. Same spelling, same intent, and the mechanism differs only because one level has an installed version to reason from and the other does not.

**On the floor.** `^1.2.0` on a group pointer is a genuine lower bound as well as a MAJOR bound: resolution selects the highest published `1.y.z` and fails if that is below `1.2.0`. Standalone, the floor never binds because it is never consulted. In practice the difference is close to invisible — the highest version in a MAJOR is below a floor within that same MAJOR only when the group names a version that was never published — but it is a real difference and is specified rather than left to be discovered.

**Alternatives considered:**

- `"1.x"` — unambiguous against `X.Y.Z` and needs no floor, and rejected because it invents a second spelling for a concept this project already spells with a caret. Two spellings for one idea is a worse cost than the small floor asymmetry above.
- Bare `"1"` — terser still, and rejected for the same reason, with the added problem that it reads as a truncated version and a typo'd `"1.0"` would be rejected with no obvious cause.
- A separate `"major": 1` field — most explicit to read, and rejected on failure mode under an older CLI. Given ADR-0016's no-`schemaVersion` invariant, an older CLI would ignore an unknown field, see no `version`, and resolve the member from `main` — silently doing the one thing the group declared must never happen. Any spelling that lives inside `version` instead fails loudly there, because an older CLI passes it through as a git ref and finds no such tag.

### Resolve each constraint to a concrete version, then reconcile

Resolution runs in two passes. First, every constraint on a name is reduced to a concrete version: an exact pin is already concrete, a MAJOR constraint is resolved against the registry's tags, an unconstrained path stays absent. Only then does the existing reconciliation rule run over the resulting set.

This keeps the reconciliation logic and its two outcomes — highest-wins-with-warning inside one MAJOR, abort across MAJORs — untouched. The new mode inserts a resolution step ahead of it rather than adding cases inside it, so the rules the spec states for mixed constraints fall out of the existing behavior instead of being separately implemented.

**Accepted consequence:** a MAJOR constraint resolving to `1.4.0` alongside an exact pin at `1.2.0` yields `1.4.0` with a warning — the exact pin is not absolutely honored. That is already true of exact-vs-exact today (`1.2.0` and `1.3.0` yield `1.3.0`), and matching the existing rule was judged better than introducing a second, differently-shaped precedence for the new mode. The alternative — exact pins always win — was rejected on that inconsistency.

### Decide a group's no-op after resolving its members, not before

A group re-import resolved nothing when the group's own version was unchanged: it printed "already up to date" and returned. The comment on that gate stated the reasoning outright — a member list can only change if the group's version changes, so an unchanged group implies unchanged members.

A caret constraint falsifies that. It resolves against the registry's current tags, so a member moves while the group stands still — which is the entire point of the feature. Left as it was, an improvement to a pointed-at skill would reach nobody until every group referencing it cut a release, the manual step this change exists to remove.

**Chosen:** resolve the member graph on every group re-import, then decide. The no-op survives as a conclusion drawn from evidence — group version unchanged, no pin changed, every member resolving to what the project already records — rather than an assumption. Reported output for an unchanged project is identical to before: same message, no manifest write, no commit.

This applies to every group, not only those with constrained members. Confining it to opted-in groups was considered and rejected by the developer in favor of one rule that holds everywhere; the cost is that a group re-import always pays a member resolution, where it previously paid a single `skill.json` read.

**Alternatives considered:**

- **Skip the gate only for a group with at least one caret member.** Cheapest correct option — the group's `skill.json` is already in hand at that point, so detecting a caret costs no extra request, and groups that never opt in keep their exact current cost. Rejected in favor of a single uniform rule.
- **Leave the gate alone.** Carets would take effect only when a group re-versions, so the three project-material groups would each need a release every time `prime-expert-context` improved. Rejected: it leaves the motivating problem unsolved.

### Discover versions by prefix-matching refs, not by listing all tags

Resolving a MAJOR constraint needs the set of published `<name>@<version>` tags. Query refs matching the prefix `<name>@` rather than listing the repository's tags and filtering client-side.

The registry accumulates one tag per version per folder, for every folder, forever — a full tag listing is paginated, grows without bound, and would make the cost of resolving one member scale with the size of the whole registry. Prefix matching keeps the response proportional to one skill's release history.

**Alternatives considered:**

- List all tags and filter locally — simplest to write, and rejected on the unbounded-growth problem above.
- Read the current `skill.json` from `main` and use its version when the MAJOR matches — no extra API surface, but it cannot find the newest `1.y.z` once `2.0.0` has landed on `main`, which is the case the feature exists for.
- A registry-maintained version index file — no ref enumeration at all, at the cost of a generated artifact that can drift from the tags that are actually the source of truth.

### Validate at manifest parse, before any fetch

The grammar check runs while the member list is read. A malformed constraint therefore fails naming the group and the entry, rather than surfacing later as a `not-found` on a tag nobody meant to request.

This tightens behavior: a value that today parses and fails late will now fail early. No published group carries such a value, so nothing in the registry changes behavior.

### Record the semantic change as a new ADR

ADR-0016 is `accepted`, which freezes its Decision, Agent Rules, and Invariants — including the rule that a pointer's `version` "present means an exact pin". That reading no longer holds, so the change lands as a new record marking 0016 superseded, not as an edit to it.

## Risks / Trade-offs

- **A new registry read per MAJOR-constrained name adds latency and consumes rate limit.** → One query per distinct name, memoized for the duration of a single import run; unconstrained and exactly-pinned members add no new calls at all.
- **Every group re-import now costs a full member resolution, including groups that use no constraints.** → Accepted deliberately in exchange for one rule that holds for every group. The cost lands on re-imports of unchanged groups, which previously paid a single `skill.json` read; the reported outcome for them is unchanged.
- **A MAJOR constraint takes a minor release with a behavioral regression, unattended.** → Inherent to the mode, and the reason it is opt-in per member. The import summary already reports resolved versions, so the change is visible in the commit rather than invisible.
- **An older CLI meeting `"^1.2.0"` reports a confusing `not-found` on a tag that was never meant to exist.** → Accepted deliberately, as the least-bad failure available under ADR-0016's no-`schemaVersion` invariant; the error names the tag, which points at the cause. Loud and wrong beats silent and wrong.
- **The caret binds resolution inside a group but not standalone, so one spelling has two strengths.** → Documented in the decision above and specified explicitly; the divergence is confined to the floor, which binds only when a group names a version that was never published in that MAJOR.
- **A group adopting the new form before the supporting CLI is released breaks its importers.** → Sequenced in the migration plan below: CLI first, registry second.
- **Reconciliation can override an exact pin with a higher version.** → Pre-existing behavior, now reachable through one more path; surfaced by the warning that already names every conflicting constraint and the version used.

## Migration Plan

1. Land and release the CLI grammar, resolution, and reconciliation support. No registry content changes yet; every published group behaves exactly as before.
2. Update `hatch-skills` group manifests to adopt `"^<version>"` where wanted — the three project-material groups' `prime-expert-context` pointer being the intended first adopters — and bump each group's own version, as CI requires for any content change.
3. Update `docs/use-cases/import-content.md` (AF-9 and the pinned-pointer business rules) and publish the new ADR.

**Rollback:** revert the registry manifests first — cheap, and immediately restores old-CLI compatibility — then the CLI change if needed. Because a group's constraint is resolved fresh on every unpack and never recorded as a project-level pin, no already-imported project holds state that a rollback would have to unwind.

## Open Questions

- Whether the standalone `@^<version>` floor pin should later be realigned to constrain resolution the way a group's MAJOR constraint now does. Deferrable: it changes neither these specs, this approach, nor the task breakdown, and it touches a mechanism this change deliberately leaves alone.
