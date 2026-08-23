# Continuous code review: Greptile on both repositories, standards in-repo, cross-repository records via a repo cluster

## Metadata

- **id:** 0031-greptile-review-with-repo-cluster-context
- **component:** continuous-code-review
- **status:** accepted
- **applies_to:** `.greptile/` in the Hatch CLI repo (hatch-cli) and the skill-content repo (hatch-skills); the standards those files declare; the set of repositories submitted to the reviewer; the mechanism by which a repository reads records it does not own
- **decision_record:** `docs/architecture/decisions/0031-greptile-review-with-repo-cluster-context.md`
- **supersedes:** `0029-greptile-continuous-review`

## Decision

[Greptile](https://www.greptile.com/) reviews pull requests in both repositories, against standards derived from the decision records. Six rules govern how it is used:

1. **Every standard lives in the repository, under version control.** Standards held only in the reviewer's hosted settings are not relied on, and no decision record cites one as the mechanism enforcing a rule.
2. **Each repository carries exactly one configuration form, at its root.** `.greptile/` — `config.json`, `files.json`, `rules.md`. `greptile.json` is not used, because `.greptile/` takes precedence where both exist and the losing form would be silently inert. Directory-level configuration is not used either: it nests, and a nested file can deactivate a rule inherited from the root.
3. **A standard derived from a record cites the record; it never restates it.** Rules are identified `adr-<record-id>`, so a record can assert its own rule exists and a rule can be traced to the decision justifying it. No repository holds a copy of a record it does not own.
4. **A repository reads records it does not own through a repository cluster, and its rules do not depend on that succeeding.** The cluster is hosted state, not in-repo, and no check can establish that it exists. So every rule citing a record in another repository SHALL state what the reviewer must establish without relying on the record's text, SHALL cite the record by a resolvable permanent URL, and SHALL instruct the reviewer to report an unreachable record rather than infer its content. An absent cluster degrades a review visibly; it does not silently pass one.
5. **Findings are advisory and post no status.** `statusCheck` is `false` in both repositories. The deterministic checks remain the merge gate.
6. **The reviewed set is this record.** `hatch-cli` and `hatch-skills` are indexed. Adding a repository to that set is a change to this record.

## Context

[0029-greptile-continuous-review](0029-greptile-continuous-review.md) settled all of this except the cross-repository half, which it got wrong.

It assumed the in-repo `context.repos` setting and the reviewer's dashboard-configured repository clusters were two front ends on one mechanism that "read the same way", and chose `context.repos` on the grounds that a check can assert a committed field is present while nothing can assert a cluster is absent. The reasoning about verifiability was sound. The premise was false.

Measured on the registry repository, `context.repos` alone does not deliver record *text*. Asked directly whether it could read a named record in `hatch-cli`, the reviewer answered that it could not — twice, and once unprompted in an ordinary review, which reported that it could not resolve the external record contents. With a repository cluster configured, the same question returned the record's first Agent Rule quoted verbatim, byte-identical to the source.

So the capability the registry side needs exists only through hosted state that no checkout can read. That is a genuine conflict with 0029's Decision 1, and it is not resolvable by preferring the in-repo setting, because the in-repo setting does not do the job.

What breaks the deadlock is that a cluster is not a *standard*. The standards stay in `.greptile/config.json`, committed and diffable. The cluster only governs how much source material the reviewer has while applying them. That makes the dependency real but bounded, and it makes the failure mode addressable: a rule that can be acted on without the record's text degrades when the cluster goes away, rather than silently passing.

## Alternatives Considered

- **`context.repos` alone, as 0029 chose.** Rejected on evidence. It is accepted as configuration and names the repository, but three observations agree it does not deliver record text. Keeping it would mean the registry rules cite records the reviewer cannot read.
- **Copying the records into `hatch-skills`.** Rejected, as it was in 0029. A copy is a second version of a decision that must be kept in agreement with the first — the failure this project rejected an index for twice.
- **A machine check that asserts the cluster exists.** Rejected: no checkout can read hosted state, and a check that queried the reviewer's API would make the record's verification depend on a network call to a third party, which is the unverifiable class this contract exists to shrink.
- **Dropping cross-repository reach entirely and letting the registry rules stand on their text alone.** Rejected as the primary plan but retained as the floor. Decision 4 requires the rules to work that way regardless, so this is what the arrangement degrades *to*, not a separate option.
- **Amending 0029 in place.** Rejected. Its Decision states the cross-repository mechanism, and Decision is frozen on an accepted record. Correcting what a frozen section mandates is a superseding record, never an edit.

## Trade-offs Accepted

- **The cluster is hosted state, and no check can see it.** Deleting it would remove the record text from every registry-side review, and nothing in either checkout would show that. This is the cost of the capability; it is bounded by Decision 4, which keeps the rules actionable without the text, and by `rules.md` instructing the reviewer to say when a record is unreachable — behaviour that has been observed.
- **A green registry review no longer implies the reviewer read the records.** It implies the rules were applied with whatever context was available. The reviewer states when it could not reach a record, so the degradation is visible in the review rather than silent, but it is not visible to a machine check.
- **Rule scope is not verified to still reach the code it governs.** Presence and activity are asserted; reach is not. A check that pins globs needs repair every time the source tree moves.
- **A rule can decay without leaving a trace.** The reviewer suppresses findings that are repeatedly dismissed. Accepted rather than engineered against, in the same shape as [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md).
- **A private repository is indexed on third-party infrastructure.** `hatch-skills` is private, and indexing sends its contents outside the project's control.
- **Volume may bury real findings.** Each rule is scoped to the paths its record governs rather than the whole tree.

## Consequences

- Both repositories carry `.greptile/` at their root, and a machine check asserts its shape.
- Every accepted record has a rule bound to it by its own identifier, active, and naming it.
- `hatch-skills` rules cite records by permanent URL and state what must be established without the record's text, so the cluster improves a review rather than enabling it.
- The reviewed set spans both repositories, and a cluster groups them so each can read the other.
- [0030-greptile-review-machine-check-context](0030-greptile-review-machine-check-context.md) is unaffected. It depends on there being a reviewer with a per-record rule, which this record continues to provide.
- 0029 becomes superseded. Its check is no longer executed; the same check belongs to this record.

## Agent Rules

- An agent MUST declare every standard the reviewer enforces in a committed file in the repository it reviews. An agent MUST NOT rely on a standard held only in the reviewer's hosted settings.
- An agent MUST keep exactly one root configuration form per repository. An agent MUST NOT add `greptile.json` beside `.greptile/`, and MUST NOT create a `.greptile` directory anywhere outside the repository root.
- An agent MUST express a standard that applies to part of the tree by scoping it to those paths in the root configuration.
- An agent MUST give every standard that enforces a decision record the identifier `adr-<record-id>`, and MUST keep that rule active and naming its record.
- An agent MUST NOT place a copy of a decision record in a repository that does not own it.
- An agent MUST write every rule citing a record owned by another repository so that it states what the reviewer must establish without the record's text, cites that record by a resolvable permanent URL, and instructs the reviewer to report an unreachable record rather than infer its content.
- An agent MUST NOT make a rule's correctness depend on the repository cluster being present, and MUST NOT assert in any record or check that the cluster exists.
- An agent MUST keep `statusCheck` set to `false` in every repository's configuration. An agent MUST NOT configure the reviewer's status as a required check.
- An agent MUST NOT submit a repository to the reviewer unless this record names it in the reviewed set.

## Invariants

| What becomes irreversible | Enforced by | Mode |
|---|---|---|
| Exactly one root configuration form, at the root, in each repository | `node scripts/adr/greptile-shape.mjs` in the `decision-records` job | blocking |
| `statusCheck` is `false`, so no status exists for branch protection to require | `node scripts/adr/greptile-shape.mjs` | blocking |
| Every accepted record carries a rule bound to it, active, and naming it | `node scripts/adr/greptile-shape.mjs` | blocking |
| Every accepted record reaches the reviewer as review context | `node scripts/adr/greptile-shape.mjs` | blocking |
| The reviewed repository set is what this record names | this record; amending it is a change to the record | advisory |
| The repository cluster exists, so cross-repository records are readable | *nothing* — hosted state, deliberately not asserted, see Trade-offs Accepted | unenforced |
| A rule's scope still reaches the code its record governs | *nothing* — deliberately not asserted | unenforced |

## Machine Check

- **context:** cli-repo

```bash
node scripts/adr/greptile-shape.mjs
```

Expected result: exit 0, reporting that the configuration has its recorded shape. A non-zero exit names which property broke — a second root form, nested configuration, a status check turned on, a record missing from the reviewer's context, or a record whose rule is absent, inactive, or no longer names it.

The check reads this repository's configuration and says nothing about the cluster, which is hosted state no checkout can see. That gap is stated in the Invariants table rather than papered over.

## Precedence

- Supersedes [0029-greptile-continuous-review](0029-greptile-continuous-review.md), whose Decision 3 named `context.repos` as the cross-repository mechanism and whose Alternatives Considered rejected repository clusters on the false premise that the two read the same way. Everything else that record settled is carried forward unchanged.
- Is the reviewer that [0030-greptile-review-machine-check-context](0030-greptile-review-machine-check-context.md) allows a record to name. That record settles the contract change; this one settles the reviewer and its deployment.
- Applies the same reasoning as [0009-skill-versioning-semver-tags](0009-skill-versioning-semver-tags.md) and [0019-registry-removed-metadata-flag](0019-registry-removed-metadata-flag.md) in refusing a copy of a record, and accepts an unverifiable dependency in the same shape as [0025-harness-shadowing-risk-accepted](0025-harness-shadowing-risk-accepted.md).
- Does not change [0004-github-vcs-platform](0004-github-vcs-platform.md) or [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md), which remain reported unverified.
- No known conflicting decision records.
