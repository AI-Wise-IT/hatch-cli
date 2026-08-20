# Destination-path collision predicate: distinct physical sources, not name shape

## Metadata

- **id:** 0024-registry-collision-predicate
- **component:** registry-collision-detection
- **status:** accepted
- **applies_to:** the collision-check logic [0014-registry-collision-detection](0014-registry-collision-detection.md) requires in both hatch-cli and hatch-skills' CI; the CLI-exposed collision-check subcommand/module implementing it
- **decision_record:** `docs/architecture/decisions/0024-registry-collision-predicate.md`

## Decision

A destination-path collision exists only when two or more **distinct physical registry source paths** would deploy to the same destination name. Concretely, the check flags a name only when it is claimed by more than one of:

- a top-level standalone skill folder (its own literal name), or
- a group's nested member folder (`<group>/<member-name>/`), physically living inside that group's own registry folder.

Two or more nested members sharing a name — whether within the same group or across different groups — collide. A nested member sharing a name with an unrelated top-level standalone skill collides. A top-level standalone skill's own name can never collide with another top-level standalone skill's name, since git already enforces uniqueness at that level.

Pointer members never introduce a new collision by themselves: a pointer only references an already-existing top-level entry (skill or group), so the same skill being pointed to by two or more different groups is the intended reuse case [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) designed pointers for, not ambiguity — it is always the identical canonical source resolving to the identical destination.

This check does **not** flag a top-level skill name merely because it happens to end in a string matching a reserved harness code (e.g. a skill literally named `foo-cld`, unrelated to being a Claude variant of `foo`). That is a distinct, narrower misresolution risk — not a literal same-destination clash — kept out of this check rather than folded into it (see Consequences), and subsequently accepted unmitigated by [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md).

The check runs once per harness the CLI currently supports, reusing [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s `resolveSkillFolderName` and the existing group/pointer resolution logic ([0013](0013-registry-group-structure-and-permanence.md), [0016-group-member-manifest-format](0016-group-member-manifest-format.md)) exactly as they exist today, and reports which harness(es) a collision affects — per [0014](0014-registry-collision-detection.md)'s explicit requirement — even though, given today's algorithms, the result is identical across every harness (see Context).

## Context

[0014-registry-collision-detection](0014-registry-collision-detection.md) settled *who* builds the collision check and *where* it runs (one real implementation in hatch-cli, invoked from both hatch-skills' and hatch-cli's own CI) but never defined the actual predicate for "collision" — it assumed the algorithm "exists" via [0001](0001-harness-suffix-convention.md) and [0013](0013-registry-group-structure-and-permanence.md) without spelling out what those algorithms actually imply mechanically. Batch 10 (`docs/build-plan.md`) cannot implement the check without that predicate being fixed.

Tracing the two resolution algorithms Batch 10 is required to reuse (rather than reimplement) resolves the ambiguity:

- `resolveSkillFolderName` ([0001](0001-harness-suffix-convention.md), `src/harness-registry.ts`) always deploys under the literal family name passed to it — the harness-suffix code is stripped at deploy time regardless of which sibling variant was actually resolved. Since a top-level registry folder name is already unique (git enforces this), two different top-level standalone skills can never produce the same destination string, for any harness.
- Group/pointer resolution (`src/registry/group-resolve.ts`, [0013](0013-registry-group-structure-and-permanence.md)/[0016](0016-group-member-manifest-format.md)) has no harness-suffix logic at all: a nested member's content is extracted by its literal name, and a pointer member fetches its target's literal top-level name directly. This is the settled design ([0016](0016-group-member-manifest-format.md) never mentions suffix resolution for pointers), not an oversight.

Given both, the only place a real destination-path clash can occur is a group's nested member — which lives outside the top-level flat namespace and so isn't constrained by git's top-level uniqueness — sharing a name with another physical source (another nested member, or an unrelated top-level standalone skill).

This was surfaced to and confirmed by the developer directly (AskUserQuestion, this session, Batch 10 kickoff), mirroring the 0015/0016/0017/0018/0020/0021/0023 precedent for a genuine gap discovered while building against an existing record.

The per-harness looping requirement is preserved verbatim from [0014](0014-registry-collision-detection.md)'s Agent Rules despite being a no-op under today's harness-blind group/pointer resolution — cheap to keep, and keeps the check correct if group/pointer resolution ever becomes harness-aware later, rather than special-casing it away based on today's registry content.

## Alternatives Considered

- **Also hard-block ADR-1's "skill name ends in a reserved harness code" shadowing risk in this same check.** Not chosen (developer confirmed): that risk is a silent misresolution (a family's suffix-variant lookup accidentally landing on an unrelated, coincidentally-suffixed skill) rather than two sources claiming the identical destination string — it never actually produces a duplicate destination path under the current resolution algorithm, since the "shadowed" family and the "shadowing" skill always deploy under different names. Folding it in would conflate two different failure modes with two different remediation stories under one report. Left out of this check instead (see Consequences); [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) later settled that it will not be detected by any check.
- **Treat every top-level folder name as a potential family and cross-check suffix-stripped forms for ambiguity.** Not chosen: traced through the math and confirmed this produces no additional true collisions beyond what the distinct-physical-source model already catches, since destination is always exactly the literal name passed to `resolveSkillFolderName` — adding this would only produce complexity, not additional detection power.
- **Skip the per-harness loop since group/pointer resolution is harness-blind today.** Not chosen: contradicts [0014](0014-registry-collision-detection.md)'s explicit Agent Rule, is cheap to keep, and remains correct if resolution logic changes later.

## Trade-offs Accepted

- **Prompt coherence:** high — "collision means two different physical folders claiming the same flattened destination; a name shape (suffix-looking) alone is never enough" is a single, stateable rule with no per-harness or per-pointer branching for an agent to track.
- **Failure surface:** the suffix-shadowing misresolution risk ADR-1 named remains completely undetected by any built tooling — accepted because it's a distinct, narrower, advisory-only concern by ADR-1's own original wording ("for human review"), not a hard-block requirement UC-5 ever specified. [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) made that acceptance permanent rather than deferred.
- **Reversibility:** high — the predicate lives entirely in the new collision-check module; broadening it later to also cover suffix-shadowing is an additive change to that one module, not a rearchitecture.
- **Operational simplicity:** the per-harness loop adds no real cost (today's registry content makes every harness's pass produce an identical result), so there's no meaningful complexity/coverage trade-off being made by keeping it.

## Consequences

- The collision-check module compares two source classes only: top-level standalone skill folder names, and every group's nested member folder names — pointer members contribute no new comparison targets, only references to entries already being compared.
- ADR-1's "flag any skill name ending in a reserved harness code, for human review before publishing" lint is not folded into Batch 10, and is not built at all: [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md) declines it outright, along with the CLI-side before/after check that would detect the same risk soundly.
- [0014-registry-collision-detection](0014-registry-collision-detection.md) is updated to cross-reference this record for the concrete predicate its own required checks enforce.

## Agent Rules

- MUST flag a destination name as colliding only when it is claimed by two or more distinct physical registry source paths (a top-level standalone skill folder, or a group's nested member folder) — MUST NOT flag a lone top-level standalone skill name as colliding with itself or with any of its own harness-suffix sibling variants.
- MUST NOT treat a pointer member as introducing a new collision on its own — a pointer only references an already-existing top-level entry.
- MUST NOT fold ADR-1's "skill name ends in a reserved harness code" shadowing check into this predicate — that remains a distinct, separately-tracked, advisory-only concern.
- MUST run the check once per harness the CLI currently supports and report which harness(es) a detected collision affects, reusing `resolveSkillFolderName` and the existing group/pointer resolution logic as-is — MUST NOT reimplement either.

## Invariants

None beyond what [0014-registry-collision-detection](0014-registry-collision-detection.md) already states. This record only fixes the predicate a shared mechanism evaluates; it introduces no new external-facing name, schema, or contract of its own that a real dependent could come to rely on independently of 0014's own invariant.

## Machine Check

```bash
grep -n "distinct physical" ../hatch-cli/src/registry/*.ts
```

Expected result (run from a checkout with access to the collision-check module once built): the collision-check module's own comments/logic reference comparing physical source paths, not name shape, confirming the predicate implemented matches this record rather than a suffix-shape heuristic.

## Precedence

- Extends [0014-registry-collision-detection](0014-registry-collision-detection.md): that record settles who builds the check and where it runs; this record settles what it actually evaluates. [0014](0014-registry-collision-detection.md) has been updated to cross-reference this record.
- Builds on [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (`resolveSkillFolderName`'s destination-is-always-the-queried-name property) and [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)/[0016-group-member-manifest-format](0016-group-member-manifest-format.md) (nested vs. pointer member semantics and format) without contradicting either.
- No known conflicting decision records.
