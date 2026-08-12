# `hatch remove --harness`'s drop path is unconditional — no drift/local-edit gating

## Metadata

- **id:** 0023-remove-harness-drop-unconditional
- **component:** cli-remove-command
- **status:** accepted
- **applies_to:** `hatch remove --harness <name>`'s AF-5 (drop a harness) handling (`src/commands/remove.ts`); does not apply to `hatch remove <name>`'s AF-2/AF-3 handling of a named skill/group target, which [0022-remove-force-flags-not-prompt](0022-remove-force-flags-not-prompt.md) continues to govern unchanged
- **decision_record:** `docs/architecture/decisions/0023-remove-harness-drop-unconditional.md`

## Decision

`hatch remove --harness <name>` removes that harness's placed content for every already-imported skill/group unconditionally — it performs no manifest/disk drift check (AF-2-shaped) and no local-edit check (AF-3-shaped) against the content being deleted. The only precondition gating the operation is UC-4's Business Rule that a project must always declare at least one harness: if `<name>` is the project's only recorded harness, the command aborts and reports that at least one harness must remain. Otherwise it always proceeds — deletes that harness's placed content for every manifest-recorded skill/group, drops `<name>` from the manifest's `harnesses` array, and commits, in one commit, regardless of whether any of that content differs from what was originally placed.

This decision introduces no `--force-all`/`--force-clean` flags for the harness-drop path — those flags, and the drift/edit gating they gate, remain scoped exclusively to a named skill/group target per [0022](0022-remove-force-flags-not-prompt.md).

## Context

[UC-4](../../use-cases/remove-content.md)'s Outcome section states removal — "a previously-imported skill, group, or harness" — should happen "without silently destroying local edits or leaving the manifest out of sync with what's actually on disk," which reads as if it could extend to a harness drop. But UC-4's own AF-5 alternative-flow text ("Drop a harness") never mentions a drift or edit check at all — it states only two conditions: the last-harness-remaining refusal, and otherwise "removes that harness's placed content for every already-imported skill/group," phrased unconditionally. [0022](0022-remove-force-flags-not-prompt.md) settled the equivalent tension for AF-2/AF-3 (a named skill/group target) with `--force-all`/`--force-clean` flags, but that record's own `applies_to` scopes it explicitly to AF-2/AF-3 — it does not by its own text extend to AF-5.

This gap — whether AF-5 should inherit AF-2/AF-3's gating mechanism or remain unconditional as its own text implies — was surfaced directly to the developer rather than guessed, per this project's standing precedent ([0015](0015-import-harness-selection-flag.md) through [0022](0022-remove-force-flags-not-prompt.md)). The developer chose unconditional removal.

## Alternatives Considered

- **Extend 0022's `--force-all`/`--force-clean` gating to the harness-drop path** — for every already-imported skill/group, check its content specifically under the harness being dropped for drift (missing) or local edits (hash-mismatched); abort by default naming every dirty item, `--force-all` overrides, `--force-clean` drops only the clean items' content in that harness while leaving dirty items' content there. Not chosen: a harness drop is a coarser and categorically different operation than removing a single skill or group. Removing a skill's only placement destroys the sole copy of that content in the project; dropping one harness while the project keeps at least one other declared harness (enforced separately, unconditionally, by this same record) leaves every affected skill/group's content fully intact under every remaining harness — nothing unique is destroyed the way AF-2/AF-3 exists to protect against. Gating a coarse, whole-harness operation behind a per-item dirty/clean report was judged to add friction disproportionate to what's actually at risk.
- **Unconditional removal, no checks at all (chosen).** Matches AF-5's own literal text, keeps the harness-drop path simple (one precondition: not the last harness), and accepts that content locally edited only under the dropped harness's own folder (not mirrored to a remaining harness) is lost without warning — a narrower, deliberately accepted risk given the harness drop's own use case (a developer intentionally dropping tool support they no longer use), not a routine per-skill cleanup operation.

## Trade-offs Accepted

- **Prompt coherence:** medium — `hatch remove` now has two different destructive-operation postures: named skill/group removal is drift/edit-gated (0022), harness drop is not. An agent or developer must know which of the two operations they're invoking to predict whether local edits are protected; mitigated by the last-harness-remaining check being the one precondition both paths still share in spirit (both refuse an operation that would leave the project in an invalid state).
- **Failure surface:** a developer who has hand-edited content that exists *only* under the harness being dropped (e.g. a harness-suffixed variant never mirrored to any other declared harness) loses that edit silently, with no report and no override needed to prevent it — an accepted risk, distinct from 0022's named-target removal, which still warns/aborts by default for exactly this scenario.
- **Reversibility:** high — the operation is still exactly one commit, recoverable via the target project's own git history like every other `hatch remove`/`hatch import` operation; nothing about this record changes that.
- **Operational simplicity:** high — no new flags, no per-item dirty-item report, no reuse of the `hashDiskTree`/`diskTreeIsEmpty` drift-detection machinery for this path at all; `src/commands/remove.ts`'s AF-5 branch stays a straight "check last-harness, then delete and update the manifest" operation.

## Consequences

- `src/commands/remove.ts`'s `--harness <name>` branch must not call `hashDiskTree`, `diskTreeIsEmpty`, or evaluate `--force-all`/`--force-clean` for any purpose — those remain scoped to the named skill/group removal path per 0022.
- `docs/use-cases/remove-content.md`'s Outcome-section wording ("without silently destroying local edits... ") should be read, from this record forward, as qualified by this record for the harness-drop path specifically — the use-case document itself is not being rewritten as part of this record, matching 0022's own precedent of narrowing UC-4 text via a targeted ADR rather than editing the use case.
- `hatch remove --harness <name>`'s only precondition is the last-harness-remaining check (UC-4 Business Rules) — this must be evaluated before any content is deleted or the manifest is written.

## Agent Rules

- MUST remove a dropped harness's placed content for every already-imported skill/group unconditionally, once the last-harness-remaining check has passed — MUST NOT introduce a drift (missing-content) or local-edit (hash-mismatch) check gating this removal.
- MUST NOT introduce `--force-all`/`--force-clean` flags, or any other confirmation flag, for the `--harness` drop path.
- MUST abort `hatch remove --harness <name>` (nothing removed, manifest unchanged, no commit) when `<name>` is the project's only recorded harness, reporting that at least one harness must remain.
- MUST NOT change `hatch remove <name>`'s existing AF-2/AF-3 `--force-all`/`--force-clean` gating ([0022](0022-remove-force-flags-not-prompt.md)) as part of implementing this record.

## Invariants

- None of this record's rules are irreversibility-bearing in the pre-launch-invariant sense: no external dependent (user, other team, published artifact, production data) observes or relies on `hatch remove --harness`'s internal gating behavior — it governs a single local CLI invocation's own runtime logic, not a name, schema, or contract anything outside the build could come to depend on. Not applicable.

## Machine Check

```bash
grep -n "force-all\|force-clean\|hashDiskTree\|diskTreeIsEmpty" src/commands/remove.ts
```

Expected result: every match traces back to the named skill/group removal path (AF-1 through AF-4) — none appear inside the `--harness` argument-parsing or drop-execution branch. (This is a manual-inspection check, not a structural one — the grep alone can't distinguish which branch a match falls in.)

## Precedence

- Narrows [0022-remove-force-flags-not-prompt](0022-remove-force-flags-not-prompt.md)'s scope by making explicit what that record's `applies_to` already implied but didn't state outright: 0022's force-flag mechanism governs AF-2/AF-3 (named skill/group target) only, and does not extend to AF-5 (harness drop) by default. Does not modify 0022's own decision or status — 0022 remains accepted, unchanged, for its own scope.
- Qualifies UC-4's ([`docs/use-cases/remove-content.md`](../../use-cases/remove-content.md)) Outcome-section wording for the harness-drop path specifically, the same way 0022 qualified AF-2/AF-3's wording — the use case itself is not rewritten.
- No known conflicting decision records.
