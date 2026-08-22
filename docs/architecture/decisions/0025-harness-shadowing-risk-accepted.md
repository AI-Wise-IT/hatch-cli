# Harness-code shadowing risk: accepted, not engineered against

## Metadata

- **id:** 0025-harness-shadowing-risk-accepted
- **component:** registry-collision-detection
- **status:** accepted
- **applies_to:** the CLI-side check [0014-registry-collision-detection](0014-registry-collision-detection.md) requires; the collision predicate [0024-registry-collision-predicate](0024-registry-collision-predicate.md) settles
- **decision_record:** `docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md`

## Decision

The harness-suffix "shadowing" risk — a newly-reserved harness code causing an existing, independently-published top-level skill name (coincidentally ending in that code) to be silently reinterpreted by `resolveSkillFolderName` as a harness-variant of some other family, shadowing its real content for that harness — will not be detected by any automated check. This is an accepted risk, not deferred work.

No static, single-snapshot check can implement this without false-positiving on legitimate, intentional family+variant pairs already published in the registry (see Context). The only sound detection would compare `resolveSkillFolderName` resolution behavior using the harness-registry.json from before vs. after a proposed hatch-cli change — a materially more complex, before/after diff check. The developer declined to build this, or the separate advisory "flag any suffix-shaped name for human review" lint ADR-0001 named in its own Consequences, given the low actual risk (see Context).

Nothing else about Batch 10 changes: the registry-side and CLI-side collision-check CI jobs, and the `check-collisions` subcommand's actual predicate ([0024-registry-collision-predicate](0024-registry-collision-predicate.md) — literal destination-path collisions between distinct physical sources) remain exactly as built. Only the CLI-side check's stated rationale changes: it verifies hatch-cli's own resolution/group-parsing logic doesn't regress against the real, live hatch-skills tree — it does not, and will not, detect harness-code-growth shadowing.

## Context

[0014-registry-collision-detection](0014-registry-collision-detection.md)'s Context states the CLI-side check exists specifically because "previously-safe registry content can become retroactively unsafe the moment a new code is reserved." Implementing that detection as part of [0024](0024-registry-collision-predicate.md)'s predicate work surfaced a real problem: the registry already has a legitimate, intentional family+variant pair — `_harness-suffix-fixture` / `_harness-suffix-fixture-cld` (Batch 5) — where `resolveSkillFolderName("_harness-suffix-fixture", "claude", ...)` correctly resolves to the `-cld` sibling. From a single snapshot of registry structure, this is structurally indistinguishable from an accidental collision: both look like "a family's own plain folder exists, and a differently-named top-level folder also exists whose suffix happens to match a reserved code." A predicate that flagged one would flag the other, making the check permanently fail against real, correct content.

Surfaced directly to the developer with the two remaining options (build a before/after diff check that compares resolution behavior across the harness-registry.json's own history; or accept the risk unmitigated). The developer chose to accept the risk, reasoning:

- [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s own Alternatives Considered already chose short, deliberately unusual abbreviated codes (`cld`, `cdx`, `csr`) specifically to make an accidental collision with an organically-named skill low-probability — this record's risk is the tail case of a tail case.
- The developer is currently the sole user and publisher of the registry, with full visibility into every skill/group name ever published — the scenario this risk describes (an unrelated third party publishing a coincidentally-suffixed name) isn't a live concern today.
- Building either detection mechanism (the before/after diff check, or ADR-0001's separate advisory lint) was judged disproportionate to the actual risk level — over-engineering for a solo-maintainer registry.

## Alternatives Considered

- **Build the before/after diff check**: compare `resolveSkillFolderName` resolution for every existing top-level family name using the harness-registry.json from a hatch-cli PR's base commit vs. its head commit, against the same hatch-skills tree, flagging any family whose resolved source folder changed. Not chosen: correctly avoids the false-positive problem, but is a materially more complex mechanism (a temporal diff, not a single-pass scan) for a risk the developer judged not worth engineering against right now.
- **Build ADR-0001's separate advisory lint** (flag any skill name ending in a reserved harness code, for human review before publishing, as [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s Consequences require). Not chosen for the same reason — judged disproportionate given the actual risk level and current single-maintainer context.
- **Fold shadowing detection into the existing static predicate** (flag whenever `resolveSkillFolderName(family, harness, ...)` returns something other than `family` itself). Not chosen: proven, concretely, to false-positive on the real `_harness-suffix-fixture` pair already in the registry — not a viable option at all, not just a judgment call.

## Trade-offs Accepted

- **Prompt coherence:** high — "this risk is accepted, not checked" is a single, stateable fact; an agent touching the harness registry doesn't need to reason about a detection mechanism that doesn't exist.
- **Failure surface:** a future harness code could, in principle, silently shadow an existing skill's content for one harness with no automated warning. Accepted given [0001](0001-harness-suffix-convention.md)'s low-collision-probability code design and the current single-maintainer context — revisit if the registry ever gains outside publishers.
- **Reversibility:** high — nothing is built that would need to be un-built; picking this back up later (the before/after diff check, or the advisory lint) is a fresh, additive implementation whenever the risk profile changes.
- **Operational simplicity:** highest of the options considered — no new check, no new CI complexity, no new false-positive risk against real content.

## Consequences

- [0014-registry-collision-detection](0014-registry-collision-detection.md)'s Context/Consequences are amended: the CLI-side check's rationale no longer claims to catch harness-code-growth shadowing. Its real, accurate value is verifying hatch-cli's own resolution/group-parsing logic doesn't regress against the real, live hatch-skills tree.
- [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s required advisory lint is rejected (won't-build) rather than left open as deferred work — this record is where that rejection lives.
- If the registry ever gains outside publishers, or the reserved-code set grows enough that collision probability meaningfully rises, this record's acceptance should be revisited — the before/after diff check described in Alternatives Considered is the concrete mechanism to build at that point.

## Agent Rules

- MUST NOT build harness-code-shadowing detection as part of the existing static `check-collisions` predicate — doing so would false-positive against legitimate family+variant pairs already in the registry (e.g. `_harness-suffix-fixture`/`-cld`).
- MUST treat the CLI-side collision-check CI job's purpose as verifying hatch-cli's resolution/group-parsing logic against real hatch-skills content, not as a harness-code-shadowing guard.
- MUST NOT claim, in documentation or CI output, that the collision check detects harness-code-growth shadowing.

## Invariants

None. This record accepts a risk rather than establishing an enforced guarantee — there is no external dependent relying on shadowing detection existing, since it never has. Nothing here becomes harder to reverse over time; building the deferred mechanism later remains a fresh, additive change regardless of when it happens.

## Machine Check

- **context:** greptile-review
- **reviewer:** Greptile, by the rule `adr-0025-harness-shadowing-risk-accepted` in `.greptile/config.json`. This record accepts a risk rather than establishing a mechanism, so there is nothing whose presence a command can confirm. Grepping the collision-check module for "shadow" and finding nothing is satisfied equally by a module that deliberately omits shadowing detection and by one that implements it under any other name.

The check below establishes only that the delegation is intact — that the rule exists, is active, and names this record. It does not establish the decision.

```bash
node scripts/adr/greptile-rule.mjs 0025-harness-shadowing-risk-accepted
```

Expected result: exit 0, reporting that the rule is active and names this record. A non-zero exit means this record has lost its judge, and the run fails.

The reviewer establishes it by confirming that no check in either repository compares `resolveSkillFolderName`'s resolution behavior before and after a harness-registry change, and that neither the CLI's collision check ([0024-registry-collision-predicate](0024-registry-collision-predicate.md)) nor any registry-side job flags a top-level name merely for ending in a reserved harness code.

A future change that *adds* such detection does not fail this record — it supersedes it.

## Precedence

- Corrects [0014-registry-collision-detection](0014-registry-collision-detection.md)'s stated rationale for the CLI-side check. [0014](0014-registry-collision-detection.md) has been updated to cross-reference this record.
- Does not narrow or contradict [0024-registry-collision-predicate](0024-registry-collision-predicate.md) — that record's predicate (literal distinct-physical-source collisions) remains exactly as built; this record only settles that it will not be extended to cover shadowing.
- Resolves [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s required advisory suffix lint as rejected (won't-build).
- No known conflicting decision records.
