## Context

See [proposal.md](proposal.md) for motivation and [specs/](specs/) for the requirements this design satisfies.

What shapes the approach is the existing machinery. `scripts/adr/records.mjs` parses each record into `{status, context, reason, commands, expected}` and returns conformance problems as text; `scripts/adr/run.mjs` classifies each record into one of `execute` / `unverified` / `skipped` / `deferred`, executes what it must, and prints a per-record report with a summary that accounts for every record. Contexts are partitioned into `EXECUTABLE_CONTEXTS` and `NON_EXECUTABLE_CONTEXTS`, and a check is run by writing its fenced block to a temporary file and handing it to `bash`. The `decision-records` job already runs this on every pull request in both repositories and blocks a failure.

A record's `## Machine Check` section is editable on an accepted record; `## Decision`, `## Agent Rules` and `## Invariants` are not. Everything below stays on the editable side of that line.

Node is a hard dependency of the repository ([ADR-0002](../../../docs/architecture/decisions/0002-cli-runtime-nodejs.md)). `jq` is not — it is present on `ubuntu-latest` but not reliably in a developer's Git Bash on Windows, and the record contract requires a check that runs as written wherever the runner runs.

## Goals / Non-Goals

**Goals:**

- One uniform mechanism covering both gaps the proposal names — the five records no command can establish, and the Agent Rules no record's check reaches.
- A delegation check whose own correctness is easy to establish, because a check that silently mis-verifies is worse than no check.
- Every property the specs require is checked from the repository, not from live third-party state.

**Non-Goals:**

- Reading the reviewer's verdicts. Nothing here parses a review, calls the reviewer's API, or gates on a finding. The delegation check establishes that the judgment is being asked for; the answer arrives as PR comments a human reads.
- Verifying that a rule's scope still reaches the code it governs — deliberately excluded, see Risks.
- Changing when a review runs. Cadence belongs to [adopt-staging-branch-release-flow](../adopt-staging-branch-release-flow/proposal.md).

## Decisions

### 1. One rule per decision record, not one rule per Agent Rule

Each accepted record gets exactly one rule in the reviewer's configuration, identified `adr-<record-id>`. Its text instructs the reviewer to enforce that record's Agent Rules, names what must be established, and cites the record; the record itself reaches the reviewer through `files.json`.

This closes both gaps with one shape. The five judgment records get a judge, and every *other* record's Agent Rules — the larger unenforced half — get a reviewer at the same time, without a second mechanism.

*Alternatives.* One rule per Agent Rule bullet: rejected — the bullets live in a frozen section, so a rule per bullet is a copy that has to track content the contract forbids editing, and the corpus carries roughly ninety of them. A single rule saying "obey every decision record": rejected — it carries no per-record identifier, so no record can assert its own rule exists, which is exactly what the specs require.

### 2. The delegation check is one tested helper, invoked per record

Each delegating record's fenced block is a single line:

```text
node scripts/adr/greptile-rule.mjs 0024-registry-collision-predicate
```

The helper reads the root configuration, resolves the rule bound to that record id, and exits non-zero if it is absent, inactive, or does not name the record. It is unit-tested beside `records.mjs`.

*Alternatives.* Inline `jq` in each record: rejected — `jq` is not guaranteed where the runner runs. Inline `node -e` one-liners: rejected — five copies of the same logic that rot independently, against a contract clause that forbids a check standing in for a property it does not establish. One helper, tested once, is the version of this that can be held to that clause.

### 3. `greptile-review` is executable and names its judge

A record declaring `greptile-review` carries what an executable context carries — exactly one fenced `bash` block and a stated `Expected result:` — **and** a `- **reviewer:**` bullet naming the judge, **and** the reviewer-facing prose describing what that judge must establish, which `review-only` already requires today.

It does not carry a `- **reason:**` bullet. `reason` exists to explain why nothing can verify the record; a delegating record has an answer to that, and the reviewer bullet is it.

In `records.mjs` this makes `conformanceProblems` branch three ways rather than two: executable, delegated, non-executable.

### 4. The runner reports delegation as its own outcome

`classify` places `greptile-review` alongside `cli-repo`, and the check executes with the working directory at the CLI repository root. All five delegated records concern CLI code, and each check reads that repository's own configuration, so nothing needs the registry checkout. A registry-side delegation later is an additive change, not a rework.

A delegating record whose check succeeds is reported `JUDGE`, counted in its own summary bucket — never `PASS`. A delegating record whose check *fails* is reported `FAIL` and blocks, like any other failing check.

`JUDGE` rather than `DELEG` because the report already carries `DEFER`, and two labels differing in one letter in a fixed-width column is a report that gets misread.

### 5. The advisory posture is made checkable by posting no status at all

The root configuration sets `statusCheck: false`. Findings still arrive as pull-request comments; what disappears is the status check itself.

The specs require that the reviewer's status not be a required check. Configured the obvious way — post a status, never mark it required — that property lives in live GitHub branch protection, which no checkout can read and which is precisely the unverifiable class this change exists to shrink. With no status posted, there is nothing to require, and a check on the configuration file establishes it.

*Trade-off.* No at-a-glance "the review ran" signal on the pull request. Accepted: the comments are the signal, and a reviewer whose absence blocks nothing does not need a liveness indicator.

### 6. The `.greptile/` folder, and nothing else

Configuration is `.greptile/config.json` (settings and the structured rules), `.greptile/files.json` (the records, as review context), and `.greptile/rules.md` (prose on how the record corpus is organised and how to read a record — orientation, not rules).

`greptile.json` is not used. The structured form is what carries `id` and `severity` per rule, which the specs require; and `.greptile/` is the form that wins when both are present, so keeping the losing form around is the silent-shadowing trap the specs forbid. A check asserts `greptile.json` is absent and that no `.greptile` directory exists outside the repository root.

### 7. `hatch-skills` carries its own configuration and reaches the records across the boundary

The records live in `hatch-cli`. `hatch-skills` gets its own root `.greptile/` whose rules cover the registry-side records ([0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md), [0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md), [0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md), [0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md), [0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md), [0028](../../../docs/architecture/decisions/0028-registry-discovery-live-walk.md)) and declares `hatch-cli` as review context so the reviewer reads those records from the repository that owns them.

No record is copied into `hatch-skills`. Which of the reviewer's cross-repository mechanisms actually delivers file content — rather than index-level context — is verified empirically before this lands, not assumed.

### 8. Two new decision records, not one

One records adopting the reviewer: which reviewer, cloud deployment, both repositories indexed, findings advisory, configuration in-repo at the root only. Its check asserts the configuration's shape.

One records the contract extension: the `greptile-review` context and what a delegating record must carry. Its check asserts that every delegating record's rule resolves, and that no `review-only` record has quietly acquired a rule without declaring its judge.

Two, because each is one decision, and a single record would bind two independent choices into one supersession unit — abandoning the reviewer later would drag the contract extension with it.

### 9. `files.json` references every accepted record individually

One entry per accepted record. A conformance check asserts the entry set equals the accepted-record set, so a record cannot be added without becoming visible to the reviewer, and a record cannot be removed from the reviewer's context without failing.

*Alternatives.* Referencing the decisions directory: the documented schema takes file paths, and directory support is not stated. Referencing only the index README and relying on the graph index to follow its links: that is an assumption about indexing behaviour, not a guarantee, and the whole point is that coverage is established rather than hoped for.

## Risks / Trade-offs

**The documented base for `files.json` paths reads two ways.** The reference states paths resolve relative to the `.greptile/` directory, while every example reads as repository-root-relative. → **Settled: paths resolve relative to the directory *containing* `.greptile/`.** For root-only configuration those two readings are the same thing, so the apparent contradiction dissolves — it is only visible for nested configuration, which this design forbids anyway. Established with `greptile config --json`, which reports all twenty-eight entries resolving from repository-root-relative paths, rather than on a throwaway pull request.

**Which cross-repository mechanism delivers record *text* to `hatch-skills`.** → **Settled: a repository cluster does; `context.repos` alone does not.** With `context.repos` naming `AI-Wise-IT/hatch-cli` and no cluster, the reviewer twice reported it could not reach a named record — once unprompted in an ordinary review, once asked directly. With a cluster configured, the same direct question returned 0013's first Agent Rule quoted verbatim, byte-identical to the source. A cluster is dashboard state, so this is a capability no checkout can verify; [0031](../../../docs/architecture/decisions/0031-greptile-review-with-repo-cluster-context.md) supersedes [0029](../../../docs/architecture/decisions/0029-greptile-continuous-review.md) to record that, and requires every cross-repository rule to state what must be established without the record's text so an absent cluster degrades a review visibly rather than silently passing one. The no-copy requirement holds throughout.

**A rule can be scoped to nothing and still pass its delegation check.** Presence and activity are asserted; reach is not. → Accepted deliberately. A check that pins globs needs repair every time the source tree moves, and that maintenance costs more than the drift it catches. Named here so it is a known hole rather than an assumed guarantee.

**A rule can decay through the learning system without leaving a trace.** → Accepted, not engineered against — see the proposal's Risk accepted.

**Twenty-eight rules may bury real findings under restated policy.** → Each rule is scoped to the paths its record governs rather than the whole tree, and strictness stays at its default until there is evidence about volume. Revisit with real reviews rather than in advance.

**The helper becomes a single point of failure for five records at once.** A bug that makes it exit 0 unconditionally silently un-verifies every delegation. → It is unit-tested for the failing cases specifically — missing rule, inactive rule, rule not naming its record — not only for the passing one.

## Migration Plan

Order matters in one place: a delegation check fails unless its rule already exists, so configuration lands before any record is converted.

1. Verify `files.json` path resolution and the cross-repository mechanism empirically. The Greptile CLI's `greptile config --json` reports the effective merged configuration for a checkout, which establishes path resolution and rule loading directly; only the cross-repository mechanism still needs a real review to confirm.
2. Land the contract extension, the runner changes, the helper, and their tests. Every existing record still conforms — nothing declares the new context yet.
3. Land `.greptile/` in `hatch-cli`, with a rule for every accepted record.
4. Convert the five records from `review-only` to `greptile-review`.
5. Land `.greptile/` in `hatch-skills`.
6. Write the two decision records and update the index.

**Rollback.** Revert the five records to `review-only` and delete the configuration. The runner keeps both contexts, so nothing else has to move, and the records return to being reported unverified — the state they are in today.

## Open Questions

- Which severity value ADR-derived rules carry. It affects how findings are presented, not what is checked or what gets built.
- Whether `rules.md` earns its place, or whether orientation prose is better held in the rule texts themselves. Decidable after seeing real reviews.
- Whether the reviewer should also be pointed at `openspec/specs/`, which states requirements the records do not. Additive later, and independent of everything above.
