## Why

Every architecture decision record in `docs/architecture/decisions/` ends with an **Agent Rules** section — plain-English `MUST` / `MUST NOT` statements — and most carry an **Invariants** section naming what becomes irreversible, how it is enforced, and in what mode. Read together they are a substantial, precise standards document.

The `decision-records` CI job enforces the executable slice of it. Each record declares one machine check and the context it runs in; the job executes every check on every pull request in both repositories and blocks a failure. Twenty-one of the twenty-eight records are covered that way.

Two kinds of rule are left over, and this change is about them.

**The seven records no command can establish.** Five turn on judgment about what code *means* rather than a fact a command can read: [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md) (is a workflow job actually wired to the check it names), [0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md) (does a first-time import of a removed target really refuse, end to end), [0023](../../../docs/architecture/decisions/0023-remove-harness-drop-unconditional.md) (which *branch* of `hatch remove` the drift gating lies in), [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md) (is the collision predicate comparing physical sources or name shape), [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md) (does no check anywhere implement shadowing detection under some other name). Two are live GitHub configuration invisible to any checkout: [0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md)'s repository visibility and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)'s branch protection. All seven declare themselves as needing review, and the runner reports them as unverified with their reason rather than passing them — visible, and unchecked.

**The rules no record's check reaches.** A record carries one check, and a record's Agent Rules are many. A green run means every record's *declared* check passed, not that every `MUST` in the corpus holds. [0026](../../../docs/architecture/decisions/0026-git-optional-dependency.md)'s check confirms git is reached through one module and never initialized; it says nothing about whether every command warns before a destructive removal in a project without a repository. That gap is the larger half of what is still unenforced, and it is the half a diff-aware reviewer is actually good at.

[Greptile](https://www.greptile.com/) reviews pull requests against a graph index of the repository, and takes custom rules as *standards written in plain English*. That is the same shape as an ADR's Agent Rules — no translation into a query language, no second formalism to maintain. Its `.greptile/files.json` points the reviewer at files in the repository as review context, so the records themselves can be the source it reads rather than a restatement of them. Reviewing a change before it lands is also the right moment for rules whose whole purpose is to catch a violation on its way in, rather than to describe the world after it has already drifted.

A reviewer that can be silently switched off is worse than no reviewer, because the record would claim a judge it no longer has. So the delegation is not a matter of trust: the link between a record and the rule that carries its judgment becomes a machine check like any other, executed by the same runner, on every pull request, blocking.

What this change settles is **the standard for how Greptile is used here** — where its configuration lives, what a rule derived from a decision record must look like, and how a record names the reviewer that judges it. The rules themselves are written against that standard rather than being part of it: a rule's text is content, and content that changes as the codebase changes does not belong in a specification.

## What Changes

- **Greptile Cloud is adopted on `hatch-cli` and `hatch-skills`**, reviewing changes in both before they reach `main`. How often that happens is settled below, not here. This indexes the private registry repository on third-party infrastructure — a decision about the registry's confidentiality, taken deliberately and recorded, not a procurement detail.
- **All configuration lives in `.greptile/` in each repository, and none in the dashboard.** Dashboard rules and repository configuration are separate systems that do not sync, and dashboard state is invisible to a checkout — the exact drift failure mode [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) each rejected an index for. Configuration that a machine check cannot read is configuration that can rot unobserved.
- **`.greptile/files.json` references `docs/architecture/decisions/`**, so the reviewer reads the records as written. `.greptile/config.json` then carries one rule per delegated decision, keyed by the record's id, whose text names what the reviewer must establish and cites the record rather than repeating its rules. The duplicate that remains is a pointer, not a copy — and a check can assert it points somewhere real.
- **Each repository carries its own root configuration, and neither holds a copy of a record.** The records live in `hatch-cli`. `hatch-skills` carries its own root configuration whose rules cite those records and read them across the repository boundary. A copy of a record in `hatch-skills` would be precisely the duplicate this shape exists to avoid, so the cross-repository reach is a requirement of the design rather than a convenience.
- **Configuration is declared at the repository root only.** Directory-level configuration nests, and a nested file can deactivate a rule inherited from the root — leaving a record's rule present and active at the root while inert exactly where the decision applies. A standard that governs part of the tree names those paths instead.
- **The delegation check asserts that the rule is there, not that it still reaches.** A rule bound to the record, active, and naming it. Whether its scope still covers the paths the decision governs is deliberately not asserted: a check that pins globs needs repair every time the source tree moves, and that maintenance costs more than the drift it would catch.
- **A sixth machine-check context, `greptile-review`, joins the record contract.** Unlike `review-only` it is executable: the record carries a command asserting that its rule exists, is enabled, and cites it. Unlike the executable contexts it names a judge, and the runner reports it under its own outcome rather than as a plain `PASS` — a green run still never claims the decision itself was verified, only that the judgment is still being asked for.
- **Five records move from `review-only` to `greptile-review`**: [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md), [0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md), [0023](../../../docs/architecture/decisions/0023-remove-harness-drop-unconditional.md), [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md), [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md). Each touches only `## Machine Check`, which the contract permits editing on an accepted record. No frozen section changes, and nothing is superseded.
- **The Agent Rules that no machine check asserts become further Greptile rules**, so a pull request violating a recorded decision is flagged where the change is made rather than discovered later.
- **Enforcement splits by determinism.** The delegation check blocks from the moment it lands, through the existing `decision-records` job, on the same reasoning that job itself had no advisory period: it protects the integrity of the record set. Greptile's own review stays advisory and its status check is not required in branch protection, because a reviewer whose judgment can be wrong is a weaker candidate for blocking than a command whose exit status cannot.
- **New decision records capture the adoption and the contract extension** — the reviewer, the deployment posture, the split enforcement, the confidentiality trade-off, and the risk accepted below — so the choices are themselves subject to the contract they extend.

### Risk accepted

**A rule can decay without leaving a trace.** Greptile suppresses findings that are repeatedly dismissed. An ADR-derived rule that draws a few false positives can quietly stop being raised, and no state in the repository would show that a record's judge had gone quiet — the delegation check would still find the rule present and active, because it is. This is accepted rather than engineered against, in the same shape as [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md): a stateable fact an agent can reason about, not a mechanism that has to be built and maintained. It is worth revisiting if decay is ever actually observed.

### Out of scope

**When a review runs, and what it costs, is settled elsewhere.** Reviewing every pull request in a workload that is mostly agent-authored branches is a question about branching and release cadence, not about standards, and [adopt-staging-branch-release-flow](../adopt-staging-branch-release-flow/proposal.md) is where it belongs. This change adopts the reviewer and fixes the shape of its rules; that change decides what gets reviewed and how often. Greptile runs on a trial for the duration of this work, so nothing here waits on that answer.

**[0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md) and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) stay unverified, and that is the end state.** Repository visibility and branch protection are live organisation state, outside a diff-based reviewer's reach and outside any checkout's. They remain `live-github`, the runner keeps reporting them as unverified with their reason, and nothing here pretends otherwise. A property no available mechanism can establish is better declared unchecked than checked badly — which is the same principle the record contract already enforces everywhere else.

## Capabilities

### New Capabilities

- `continuous-code-review`: an external reviewer examines changes in both repositories against standards held in version-controlled configuration, derived from the decision records rather than restated, in an advisory posture. The standard fixes where those standards live and how they bind to a record; how often a review runs is deliberately not part of it.

### Modified Capabilities

- `decision-record-convention`: a record whose verification requires judgment currently declares only that review is needed and is reported unverified. It gains the ability to name the reviewer that performs that judgment and to carry an executable check that the delegation is intact — and the runner gains an outcome that reports such a record honestly, distinct from both a verified pass and an unverified record.

## Impact

- **`docs/architecture/decisions/README.md`** — the contract gains the `greptile-review` context, its conformance rules, and what the runner reports for it.
- **`scripts/adr/records.mjs`** — the context sets and `conformanceProblems`: `greptile-review` requires a fenced block, an expected result, *and* the reviewer-facing prose that `review-only` requires today.
- **`scripts/adr/run.mjs`** — `classify` places the new context, and `report` gains its own label and summary bucket so the accounting stays complete.
- **`scripts/adr/records.test.mjs`** and the run tests — the new context's conformance and classification.
- **Five record files** — `## Machine Check` only.
- **`.greptile/` in both repositories** — `config.json`, `rules.md`, `files.json`.
- **`.github/workflows/ci.yml`** — unchanged. The delegation checks are ordinary record checks and run inside the existing `decision-records` job.
- **A new decision record**, and the index in `docs/architecture/decisions/README.md`.
- **Operationally** — a private repository is indexed on third-party infrastructure.
