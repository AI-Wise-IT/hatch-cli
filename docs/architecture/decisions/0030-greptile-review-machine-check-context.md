# Machine-check context `greptile-review`: a record may name its judge, and the runner reports it as delegated

## Metadata

- **id:** 0030-greptile-review-machine-check-context
- **component:** decision-record-convention
- **status:** accepted
- **applies_to:** the record contract in `docs/architecture/decisions/README.md`; the context sets and conformance rules in `scripts/adr/records.mjs`; classification and reporting in `scripts/adr/run.mjs`; every record whose verification requires judgment
- **decision_record:** `docs/architecture/decisions/0030-greptile-review-machine-check-context.md`

## Decision

A sixth machine-check context, `greptile-review`, joins the record contract. It is for a record whose verification requires judgment about what code means **and** which names a reviewer that performs that judgment continuously.

1. **A delegating record carries four things.** A `- **reviewer:**` bullet naming the judge; exactly one fenced `bash` block; a stated `Expected result:`; and prose describing what the reviewer must establish. It carries **no** `- **reason:**` bullet — `reason` exists to say why nothing can verify the record, and a delegating record has an answer to that.
2. **The check establishes the delegation, not the decision.** It asserts that the reviewer's standards carry a rule bound to the record, that the rule is active, and that it names the record. Nothing parses a review, calls the reviewer's API, or gates on a finding.
3. **A missing, inactive, or unbound rule fails and blocks.** A record claiming a judge it no longer has is a worse state than a record declaring itself unverified: the first reads as covered and is not, while the second is honest. The check exists to make the first state unreachable quietly.
4. **The runner reports it under its own outcome.** A delegating record whose check passes is reported `JUDGE` and counted in its own summary bucket — never `PASS`. The strongest claim it supports is that the judgment is still being asked for. A delegating record whose check *fails* is reported `FAIL` and blocks, like any other failing check.
5. **A record that has a judge names it.** A record declaring `review-only` asserts that no reviewer performs its judgment. If a rule bound to that record exists, the assertion is false and the record is understating its own coverage.

`review-only` and `live-github` are unchanged. A record no reviewer judges still declares that and is still reported unverified.

## Context

The contract already required that a decision whose verification needs judgment declare that, rather than present a command whose success is unrelated to the property it asserts. Five records did exactly that and were reported unverified.

That was honest but terminal. The record said "a reviewer establishes this", and nothing in the project established that a reviewer ever would. Once [0031-greptile-review-with-repo-cluster-context](0031-greptile-review-with-repo-cluster-context.md) put a reviewer in place with a per-record rule, the records could name it — but naming a judge is worth nothing if the judge can be removed without a trace. A reviewer that can be silently switched off is worse than no reviewer, because the record would claim a judge it no longer has.

So the delegation itself became a machine check like any other: same runner, same trigger, blocking on failure. What a delegating record asserts is narrow and true — the rule is there, it is on, and it points at this record. What it deliberately does not assert is that the decision holds. That is the reviewer's job, and its answer arrives as pull-request comments a human reads.

The reporting outcome is the other half. Folding a delegated record into `PASS` would have made a green run claim more than it established, which is the failure the contract's judgment clause exists to prevent. A distinct outcome keeps the summary honest while still accounting for every record.

## Alternatives Considered

- **Inline `jq` in each delegating record's check.** Rejected. `jq` is present on `ubuntu-latest` but not reliably in a developer's Git Bash on Windows, and the contract requires a check that runs as written wherever the runner runs.
- **Inline `node -e` one-liners per record.** Rejected. Five copies of the same logic that rot independently, against a contract clause forbidding a check that stands in for a property it does not establish. One helper, unit-tested once — including for its failing cases specifically — is the version that can be held to that clause.
- **Reporting a delegated record as `PASS`.** Rejected, per Decision 4.
- **The label `DELEG` rather than `JUDGE`.** Rejected. The report already carries `DEFER`, and two labels differing in one letter in a fixed-width column is a report that gets misread.
- **Letting a delegating record keep its `reason` bullet.** Rejected. It would claim the record is at once judged and unjudgeable.
- **Parsing the reviewer's verdicts and gating on them.** Rejected. That would make an unreproducible judgment a merge gate, which [0031-greptile-review-with-repo-cluster-context](0031-greptile-review-with-repo-cluster-context.md) settles against.

## Trade-offs Accepted

- **A green `JUDGE` proves less than a green `PASS`.** It establishes that the question is still being asked, not that the answer is right. This is stated in the report rather than hidden, and it is strictly more than the `UNVER` it replaces.
- **The helper is a single point of failure for five records at once.** A bug making it exit 0 unconditionally would silently un-verify every delegation. Mitigated by unit-testing the failing cases — missing rule, disabled rule, rule switched off through `disabledRules`, rule not naming its record — not only the passing one.
- **`review-only` becomes hard to reach for an accepted record.** [0031-greptile-review-with-repo-cluster-context](0031-greptile-review-with-repo-cluster-context.md) gives every accepted record a rule, and Decision 5 forbids a `review-only` record from having one. Together they mean an accepted record whose verification needs judgment declares `greptile-review`. This is deliberate: the reviewer is already reading every record, so a record claiming nobody judges it would be wrong. `review-only` remains available to a `concept` record and to any record whose rule is deliberately absent.

## Consequences

- `scripts/adr/records.mjs` partitions contexts three ways — executable, delegating, non-executable — and `conformanceProblems` branches accordingly.
- `scripts/adr/run.mjs` classifies `greptile-review` where `cli-repo` runs, and `report` gains the `JUDGE` label and a summary bucket, so the summary still accounts for every record.
- Five records moved from `review-only` to `greptile-review`, each touching only `## Machine Check`.
- [0004-github-vcs-platform](0004-github-vcs-platform.md) and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) stay `live-github` and stay unverified. A property no available mechanism can establish is better declared unchecked than checked badly.
- Rollback is to revert the delegating records to `review-only`. The runner keeps both contexts, so nothing else has to move.

## Agent Rules

- An agent MUST declare `greptile-review` on a record whose verification requires judgment and whose judgment a named reviewer performs continuously.
- An agent MUST give a `greptile-review` record a `- **reviewer:**` bullet, exactly one fenced `bash` block, a stated `Expected result:`, and prose describing what the reviewer must establish.
- An agent MUST NOT give a `greptile-review` record a `- **reason:**` bullet.
- An agent MUST make a delegating record's check establish that the reviewer's standards carry a rule bound to that record, that the rule is active, and that the rule names the record. An agent MUST NOT make it assert that the decision itself holds.
- An agent MUST fail the run when a delegating record's rule is missing, inactive, or no longer names the record, and MUST name the record that lost its reviewer.
- An agent MUST report a passing delegating record under an outcome distinct from a verified pass, and MUST count it in its own summary bucket. An agent MUST NOT report it as `PASS`.
- An agent MUST report a failing delegating record as a failure that blocks, exactly as it would any other failing check.
- An agent MUST NOT leave a record declaring `review-only` while a rule bound to that record exists in the reviewer's standards. Such a record MUST declare `greptile-review` and name its judge.
- An agent MUST continue to report a record that names no reviewer as unverified, never as passing.

## Invariants

| What becomes irreversible | Enforced by | Mode |
|---|---|---|
| Every delegating record resolves an active rule that names it | `node scripts/adr/greptile-delegation.mjs` in the `decision-records` job | blocking |
| No `review-only` record carries a rule without declaring its judge | `node scripts/adr/greptile-delegation.mjs` | blocking |
| A delegating record carries a reviewer bullet, one fenced block, and an expected result, and no reason bullet | `conformanceProblems` in `scripts/adr/records.mjs`, run by `node scripts/adr/check.mjs` | blocking |
| A delegating record is never reported as a plain pass | `report` in `scripts/adr/run.mjs`, and its unit tests | blocking |
| That the reviewer's judgment is correct, or that it was ever exercised | *nothing* — the check establishes delegation, not the decision | unenforced |

## Machine Check

- **context:** cli-repo

```bash
node scripts/adr/greptile-delegation.mjs
```

Expected result: exit 0, reporting that every delegating record resolves its rule and no record declaring itself unjudged carries one. A non-zero exit names each record whose delegation could not be resolved, or which declares `review-only` while carrying a rule.

## Precedence

- Extends the record contract in `docs/architecture/decisions/README.md`, adding a sixth context alongside `cli-repo`, `registry-checkout`, `both`, `live-github` and `review-only`. It changes none of them.
- Depends on [0031-greptile-review-with-repo-cluster-context](0031-greptile-review-with-repo-cluster-context.md) for the reviewer, its configuration shape, and the per-record rule this context resolves. The two are separate records because each is one decision, and abandoning the reviewer should not drag the contract extension with it.
- Changes the `## Machine Check` section only of [0014-registry-collision-detection](0014-registry-collision-detection.md), [0021-block-first-time-import-of-removed-target](0021-block-first-time-import-of-removed-target.md), [0023-remove-harness-drop-unconditional](0023-remove-harness-drop-unconditional.md), [0024-registry-collision-predicate](0024-registry-collision-predicate.md) and [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md). Their frozen sections are untouched and none is superseded.
- No known conflicting decision records.
