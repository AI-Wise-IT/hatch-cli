# Continuous code review: Greptile Cloud on both repositories, configured in-repo, advisory

## Metadata

- **id:** 0029-greptile-continuous-review
- **component:** continuous-code-review
- **status:** superseded
- **superseded_by:** 0031-greptile-review-with-repo-cluster-context
- **applies_to:** `.greptile/` in the Hatch CLI repo (hatch-cli) and the skill-content repo (hatch-skills); the standards those files declare; the set of repositories submitted to the reviewer
- **decision_record:** `docs/architecture/decisions/0029-greptile-continuous-review.md`

## Decision

[Greptile](https://www.greptile.com/) reviews pull requests in both repositories, against standards derived from the decision records. Five rules govern how it is used:

1. **Every standard lives in the repository, under version control.** Standards held only in the reviewer's hosted settings are not relied on, and no decision record cites one as the mechanism enforcing a rule. Configuration that no checkout can read is configuration that can rot unobserved.
2. **Each repository carries exactly one configuration form, at its root.** `.greptile/` — `config.json`, `files.json`, `rules.md`. `greptile.json` is not used, because `.greptile/` takes precedence where both exist and the losing form would be silently inert. Directory-level configuration is not used either: it nests, and a nested file can deactivate a rule inherited from the root, leaving a record's rule present and active at the root while inert exactly where the decision applies. A standard governing part of the tree names those paths instead.
3. **A standard derived from a record cites the record; it never restates it.** The record itself reaches the reviewer as review context, and the rule identifies it and states what must be established. Rules are identified `adr-<record-id>`, so a record can assert its own rule exists and a rule can be traced to the decision justifying it. This holds across repositories: `hatch-skills` reads the records from `hatch-cli`, which owns them, and holds no copy of any record.
4. **Findings are advisory and post no status.** `statusCheck` is `false` in both repositories, so no status is emitted for branch protection to require. The same change reviewed twice can produce different findings, and a gate whose verdict is not reproducible fails changes for reasons their author cannot act on. The deterministic checks remain the merge gate.
5. **The reviewed set is this record.** `hatch-cli` and `hatch-skills` are indexed. Adding a repository to that set is a change to this record, because submitting a repository to an external reviewer sends its contents outside the project's control.

## Context

Twenty-one of the twenty-eight records at the time of this decision carried a machine check a command could execute. The rest were left over in two ways, and both are what this reviewer is for.

Five records turned on judgment about what code *means* rather than a fact a command could read — whether a workflow job is genuinely wired to the check it names, which *branch* of a command a gate lies in, whether a predicate compares physical sources or name shape. They declared themselves unverified and stayed that way: visible, and unchecked.

The larger gap was quieter. A record carries one check, and a record's Agent Rules are many. A green run meant every record's *declared* check passed, not that every `MUST` in the corpus held. Roughly ninety rule bullets across the corpus had no mechanism at all behind them.

Greptile takes custom rules as standards written in plain English — the same shape an ADR's Agent Rules already have, with no translation into a query language and no second formalism to maintain. Its `files.json` points the reviewer at files in the repository, so the records themselves are what it reads rather than a restatement of them. Reviewing a change before it lands is also the right moment for rules whose purpose is to catch a violation on its way in, rather than to describe the world after it has drifted.

The in-repo-only constraint is not a preference. This project has twice rejected an index whose contents could drift from their source — [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) and [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) — and dashboard configuration is that failure mode in a new place: invisible to a checkout, unreadable by a machine check, changeable without a trace.

## Alternatives Considered

- **Dashboard configuration, or the reviewer's Repo Clusters for cross-repository context.** Rejected. Clusters are the dashboard equivalent of the in-repo `context.repos` setting and read the same way, but nothing in either checkout would record the grouping. A check can assert that `context.repos` is present in a committed file; no check can assert that a cluster is *absent*, so clusters can silently add to what a review reads. Unverifiable in the direction that matters.
- **One rule per Agent Rule bullet.** Rejected. The bullets live in a frozen section, so a rule per bullet is a copy tracking content the contract forbids editing, across roughly ninety bullets.
- **A single rule saying "obey every decision record".** Rejected. It carries no per-record identifier, so no record could assert its own rule exists.
- **Referencing the decisions directory, or only the index README.** Rejected. The documented schema takes file paths, and relying on the graph index to follow the README's links is an assumption about indexing behaviour rather than established coverage.
- **Posting a status and never marking it required.** Rejected. That property would live in live branch protection, which no checkout can read — the exact unverifiable class this record exists to shrink. With no status posted, there is nothing to require, and a check on the configuration file establishes it.
- **Blocking on findings.** Rejected, for the reproducibility reason in Decision 4.

## Trade-offs Accepted

- **No at-a-glance "the review ran" signal on a pull request.** The comments are the signal. A reviewer whose absence blocks nothing does not need a liveness indicator.
- **A private repository is indexed on third-party infrastructure.** `hatch-skills` is private, and indexing sends its contents outside the project's control. Taken deliberately, and recorded here rather than settled in a settings page.
- **Rule scope is not verified to still reach the code it governs.** Presence and activity are asserted; reach is not. A check that pins globs needs repair every time the source tree moves, and that maintenance costs more than the drift it would catch. Named here so it is a known hole rather than an assumed guarantee.
- **A rule can decay without leaving a trace.** The reviewer suppresses findings that are repeatedly dismissed. A rule drawing false positives can quietly stop being raised, and no state in either repository would show it — the delegation check would still find the rule present and active, because it is. Accepted rather than engineered against, in the same shape as [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md). Worth revisiting if decay is ever observed.
- **Volume may bury real findings under restated policy.** Each rule is scoped to the paths its record governs rather than the whole tree, and strictness stays where it is until there is evidence from real reviews.

## Consequences

- Both repositories carry `.greptile/` at their root, and a machine check asserts its shape.
- Every accepted record has a rule bound to it by its own identifier, so a record cannot be added without becoming visible to the reviewer, and cannot lose its rule without a check failing.
- `hatch-skills` reaches the records across the repository boundary through `context.repos`, and holds no copy of any record.
- A record whose verification needs judgment can now name this reviewer as its judge. What that means for the record contract is [0030-greptile-review-machine-check-context](0030-greptile-review-machine-check-context.md), which is a separate decision.
- How often a review runs, and what it costs, is not settled here. That belongs to branching and release cadence.

## Agent Rules

- An agent MUST declare every standard the reviewer enforces in a committed file in the repository it reviews. An agent MUST NOT rely on a standard held only in the reviewer's hosted settings, and MUST NOT cite one in a decision record as the mechanism enforcing a rule.
- An agent MUST keep exactly one root configuration form per repository. An agent MUST NOT add `greptile.json` beside `.greptile/`, and MUST NOT create a `.greptile` directory anywhere outside the repository root.
- An agent MUST express a standard that applies to part of the tree by scoping it to those paths in the root configuration. An agent MUST NOT introduce directory-level reviewer configuration.
- An agent MUST give every standard that enforces a decision record the identifier `adr-<record-id>`.
- An agent MUST supply a cited record to the reviewer as review context and MUST NOT reproduce that record's rules in the standard's text.
- An agent MUST NOT place a copy of a decision record in a repository that does not own it. Where a repository's standards enforce records owned by another repository, an agent MUST reach those records across the repository boundary.
- An agent MUST keep `statusCheck` set to `false` in every repository's configuration. An agent MUST NOT configure the reviewer's status as a required check.
- An agent MUST NOT submit a repository to the reviewer unless this record names it in the reviewed set. Adding one MUST be a change to this record.

## Invariants

| What becomes irreversible | Enforced by | Mode |
|---|---|---|
| Exactly one root configuration form, at the root, in each repository | `node scripts/adr/greptile-shape.mjs` in the `decision-records` job | blocking |
| `statusCheck` is `false`, so no status exists for branch protection to require | `node scripts/adr/greptile-shape.mjs` | blocking |
| Every accepted record carries a rule bound to it by its identifier | `node scripts/adr/greptile-shape.mjs` | blocking |
| Every accepted record reaches the reviewer as review context | `node scripts/adr/greptile-shape.mjs` | blocking |
| The reviewed repository set is what this record names | this record; amending it is a change to the record | advisory |
| A rule's scope still reaches the code its record governs | *nothing* — deliberately not asserted, see Trade-offs Accepted | unenforced |

## Machine Check

- **context:** cli-repo

```bash
node scripts/adr/greptile-shape.mjs
```

Expected result: exit 0, reporting that the configuration has its recorded shape. A non-zero exit names which of the five properties broke — a second root form, nested configuration, a status check turned on, a record missing from the reviewer's context, or a record with no rule bound to it.

The check reads this repository's configuration. `hatch-skills` carries its own root configuration and its own copy of this constraint; the reviewed set spanning both repositories is what this record itself states, and is not asserted by a command.

## Precedence

- Superseded by [0031-greptile-review-with-repo-cluster-context](0031-greptile-review-with-repo-cluster-context.md). Decision 3 of this record named `context.repos` as the mechanism by which a repository reads records it does not own, and Alternatives Considered rejected repository clusters on the premise that the two "read the same way". Measurement showed otherwise: `context.repos` alone does not deliver record text, and a cluster does. 0031 carries everything else here forward unchanged.
- Extends the enforcement described in [0007-github-actions-deployment](0007-github-actions-deployment.md): the reviewer's own findings are advisory and post no status, so nothing here changes the required-check set that record established.
- Applies the same reasoning as [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) and [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md): a second copy of a fact, held where it can drift from its source, is rejected in favour of reading the source.
- Accepts a risk in the same shape as [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md): rule decay is stated so an agent can reason about it, not engineered against.
- Is the reviewer that [0030-greptile-review-machine-check-context](0030-greptile-review-machine-check-context.md) allows a record to name. That record settles the contract change; this one settles the reviewer and its deployment. Abandoning this reviewer does not drag the contract extension with it.
- Does not change [0004-github-vcs-platform](0004-github-vcs-platform.md) or [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md), which assert live GitHub state outside any diff review's reach and remain reported unverified.
- No known conflicting decision records.
