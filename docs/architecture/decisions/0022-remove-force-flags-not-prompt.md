# `hatch remove`'s AF-2/AF-3 gating: `--force-all`/`--force-clean` flags, not an interactive prompt

## Metadata

- **id:** 0022-remove-force-flags-not-prompt
- **component:** cli-remove-command
- **status:** accepted
- **applies_to:** `hatch remove`'s AF-2 (manifest/disk drift) and AF-3 (local edits present) handling (`src/commands/remove.ts`); does not apply to `hatch import`'s own AF-3 local-edit protection or AF-6 interactive prompt (`src/commands/import.ts`), which are unchanged
- **decision_record:** `docs/architecture/decisions/0022-remove-force-flags-not-prompt.md`

## Decision

`hatch remove` never prompts interactively, in any mode (TTY or piped). AF-2 (the manifest records an item as imported but its placed content is missing/drifted on disk) and AF-3 (placed content has been locally edited since import) are both gated by two mutually exclusive command-line flags instead of `src/cli/prompt.ts`'s `promptLine` confirm pattern:

- **No flag (default):** `hatch remove` first evaluates every item in the operation's target set — the single named skill for a standalone target, or every member for a group target — for AF-2/AF-3 dirtiness (missing or locally-edited content, detected via the same `contentHash`/`hashFromDisk` mechanism [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) already established). If any item is dirty, the entire operation aborts: nothing is removed, nothing is committed. The report names every dirty item and states that `--force-all` or `--force-clean` would resolve it.
- **`--force-all`:** removes every item in the target set regardless of AF-2/AF-3 dirtiness — overrides both checks for every item.
- **`--force-clean`:** removes only the items in the target set that are *not* dirty; any dirty item is left in place with a warning. If every item in the target set is dirty — including the standalone single-skill case, where the target set has exactly one item — `--force-clean` removes nothing and reports that nothing was removed. This is a no-op success, not a failure.

This applies uniformly to both a standalone skill target and a group target — there is no separate prompt-based path for the standalone case. AF-4 (a named target is a single skill belonging to a group) and AF-1 (not imported) are unaffected by this record: AF-4 refuses outright, before any AF-2/AF-3 evaluation, regardless of any flag; AF-1 is a pure no-op with no flags involved.

## Context

UC-4 ([`docs/use-cases/remove-content.md`](../../use-cases/remove-content.md)) describes AF-2 and AF-3 in prompt-shaped terms ("if run interactively: system asks... if run unattended: system aborts by default"), and this batch's own build-plan brief proposed reusing `hatch import`'s AF-6 `promptLine` confirm pattern for consistency. Two things made that reuse plan wrong once examined:

1. **Group targets make AF-2/AF-3 a multi-item decision, not a single yes/no.** UC-4's main flow explicitly includes removing a whole group, and its members may each independently be clean, missing, or edited. Neither UC-4 nor [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) specifies what happens when only some members are dirty — a genuine, load-bearing gap, surfaced directly to the developer per this project's standing precedent ([0015](0015-import-harness-selection-flag.md), [0016](0016-group-member-manifest-format.md), [0017](0017-manifest-schema-v2-group-membership.md), [0018](0018-manifest-content-hash-local-edit-detection.md), [0019](0019-registry-removed-metadata-flag.md), [0020](0020-standalone-version-pin-manifest-and-parsing.md), [0021](0021-block-first-time-import-of-removed-target.md)) rather than guessed.
2. **The developer's actual priority is autonomous/unattended agents driving the CLI, not interactive terminals.** Confirmed directly in conversation: a TTY prompt is not something an unattended agent can answer, and branching CLI behavior on `stdin.isTTY` (as `hatch import`'s AF-6 does) produces two different behavioral paths for the same decision. A flag is scriptable, deterministic, and identical for a human and an agent. On learning this, the developer chose to apply the flag mechanism to the standalone case as well, superseding this batch's original prompt-reuse plan for `hatch remove` specifically.

## Alternatives Considered

- **Reuse `promptLine` for both standalone and group targets, exactly as `hatch import`'s AF-6 does.** This batch's original plan. Not chosen: doesn't answer the group multi-item question on its own (would still need a per-member prompt loop or an aggregate yes/no that hides which member failed), and doesn't serve the developer's stated priority of unattended-agent-friendliness — an interactive prompt is unusable by a non-interactive caller by construction.
- **Per-member partial skip by default (no flag needed at all): clean members removed, dirty ones silently left in place with a warning.** Considered as the group-specific default in an earlier round of this conversation. Not chosen: silently proceeding with a partial group removal by default cuts against AF-4's own rationale (group members may depend on each other) — a partially-removed group is exactly the inconsistent state AF-4 exists to prevent for the reverse case (partial *import*). The developer's chosen design keeps this behavior available, but only as an explicit, deliberate `--force-clean` opt-in, never the default.
- **All-or-nothing abort by default with no override at all (no flags).** Considered as this record's first draft. Not chosen: leaves no scriptable path forward for an agent that has confirmed it wants to proceed anyway (e.g., a re-provisioning agent that intentionally wants to blow away local edits, or one that wants to clean up whatever it safely can). The two-flag design keeps the safe default while giving both realistic recovery paths a name.
- **A single `--force` flag with no distinction between "remove everything" and "remove only what's clean."** Not chosen: conflates two meaningfully different outcomes (destructive override of local edits vs. a conservative partial cleanup) into one flag: a caller wanting the conservative behavior would have no way to ask for it without also accepting the destructive one.

## Trade-offs Accepted

- **Prompt coherence:** high — "no flag aborts and names the problem, `--force-all` overrides everything, `--force-clean` keeps only what's safe" is a short, stateable rule with no TTY-detection branch for an agent to reason about; it also unifies the standalone and group cases under one mental model instead of two.
- **Failure surface:** a caller who reflexively reaches for `--force-all` without reading the dirty-item report can lose local edits exactly as `hatch import`'s existing local-edit protection is meant to prevent — an accepted risk identical in shape to any other explicit force-override flag, mitigated by the default remaining a hard abort and by the report naming every affected item before any flag is needed.
- **Reversibility:** high — both flags only change what a single invocation does; the underlying detection mechanism (`contentHash`/`hashFromDisk`) is unchanged and already accepted as high-reversibility in [0018](0018-manifest-content-hash-local-edit-detection.md), and every `hatch remove` invocation is still a single commit, recoverable via the target project's own git history.
- **Operational simplicity:** high — no new prompt machinery, no TTY-detection code path in `hatch remove` at all; reuses the existing hash-comparison mechanism and the existing one-invocation-one-commit convention.

## Consequences

- `src/commands/remove.ts` must parse `--force-all` and `--force-clean` as mutually exclusive flags (passing both is a usage error) and must never call `promptLine`/`promptHidden` or branch on `process.stdin.isTTY` for AF-2/AF-3 purposes.
- `src/commands/remove.ts`'s AF-2/AF-3 evaluation must run against the full target set (one item for a standalone skill, every member for a group) before any removal happens, so the no-flag abort path can report every dirty item in one pass rather than failing on the first one encountered.
- The dirty-item report (no-flag abort case) must name each affected item and state both flags as the resolution path, so a caller — human or agent — can decide without needing to consult documentation.
- `--force-clean` resulting in an empty removal set (every target-set item was dirty) is a success/no-op: no commit is made, and the report must say so explicitly rather than looking like a silent failure.
- `docs/use-cases/remove-content.md`'s AF-2/AF-3 wording ("if run interactively... if run unattended...") should be read, from this record forward, as superseded by this record's flag-based mechanism for `hatch remove` specifically — the use-case document itself is not being rewritten as part of this record.
- Does not change `hatch import`'s own AF-3 local-edit protection or its AF-6 interactive prompt (`src/cli/prompt.ts`'s `promptLine`) — both continue exactly as [0018](0018-manifest-content-hash-local-edit-detection.md) and Batch 5 established them.

## Agent Rules

- MUST gate `hatch remove`'s AF-2 and AF-3 handling exclusively via `--force-all`/`--force-clean` — MUST NOT introduce an interactive prompt or a `process.stdin.isTTY` branch into `src/commands/remove.ts` for this purpose.
- MUST evaluate AF-2/AF-3 dirtiness for every item in the target set before removing anything, in both the standalone and group cases — MUST NOT remove some items before dirtiness has been checked for all of them.
- MUST abort the entire operation (no removal, no manifest change, no commit) when no flag is given and at least one target-set item is dirty, naming every dirty item and both flags in the report.
- MUST treat `--force-clean` removing zero items (every target-set item was dirty) as a success/no-op, not a failure exit code.
- MUST NOT accept `--force-all` and `--force-clean` together — MUST reject that combination as a usage error before any dirtiness evaluation.
- MUST NOT change `hatch import`'s existing AF-3/AF-6 prompt-based mechanism as part of implementing this record.

## Invariants

- **The `--force-all`/`--force-clean` flag names and their exact, mutually-exclusive semantics.** Becomes irreversible once: real automation scripts pass these flags — renaming them or changing what each does would silently change what a script believes it's asking for. Enforcement mechanism: current behavior is covered by automated tests; nothing asserts these flag names/semantics stay stable release-over-release. Current mode: not-yet-built; flagged for completeness rather than urgency, since no real automation exists yet to depend on it.

## Machine Check

```bash
grep -n "promptLine\|stdin.isTTY" src/commands/remove.ts
```

Expected result: no output — `src/commands/remove.ts` contains no reference to `promptLine`, `promptHidden`, or `process.stdin.isTTY`; AF-2/AF-3 gating is entirely flag-driven.

## Precedence

- Narrows UC-4's ([`docs/use-cases/remove-content.md`](../../use-cases/remove-content.md)) AF-2/AF-3 wording specifically for `hatch remove`'s implementation, superseding this batch's brief's original plan to reuse `hatch import`'s prompt pattern.
- Builds on [0018-manifest-content-hash-local-edit-detection](0018-manifest-content-hash-local-edit-detection.md) — reuses its `contentHash`/`hashFromDisk` mechanism unchanged as the dirtiness check; does not alter that record's own scope (`hatch import`'s re-import logic).
- Complements [0021-block-first-time-import-of-removed-target](0021-block-first-time-import-of-removed-target.md) and [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) in continuing this project's pattern of resolving a genuine UC-level gap via a targeted ADR rather than an inline guess.
- Does not affect `hatch import`'s AF-6 interactive prompt (`src/cli/prompt.ts`'s `promptLine`, established in Batch 5) — that mechanism is unchanged and out of this record's scope.
- No known conflicting decision records.
