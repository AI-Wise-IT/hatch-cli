# Architecture Decisions

Each file in this directory records one architecture or technology decision. A record is
not a note: it is the enforceable, agent-readable statement of what the project has
settled, and the rules below are checked on every pull request rather than trusted.

## The record contract

### Required sections

Every record carries these sections, in this order, each as a level-2 heading:

| Section | Holds |
|---|---|
| `## Metadata` | `id`, `component`, `status`, `applies_to`, `decision_record`, as a bullet list |
| `## Decision` | what was decided, stated normatively |
| `## Context` | the forces that produced the decision |
| `## Alternatives Considered` | what was rejected, and why |
| `## Trade-offs Accepted` | what the decision costs |
| `## Consequences` | what follows from it |
| `## Agent Rules` | the MUST / MUST NOT an agent building against this record obeys |
| `## Invariants` | what becomes irreversible, its enforcement mechanism, and that mechanism's current mode |
| `## Machine Check` | how a machine — or, where that is impossible, a reviewer — establishes the record still holds |
| `## Precedence` | how this record relates to the others it touches |

A record may carry further sections beyond these — `## Decision History`, or an
explicitly-marked `### … correction (post-acceptance)` subsection — but never fewer.
A record missing any required section is non-conforming and fails the conformance check.

### Status lifecycle

`status` in `## Metadata` is exactly one of:

- **`concept`** — working material. Every section may be edited freely, including
  Decision, Agent Rules and Invariants. Nothing else may cite a `concept` record as a
  settled decision, and no agent rule may be derived from one.
- **`accepted`** — the project is operating under this decision. Its frozen sections are
  immutable (below).
- **`superseded`** — replaced by a later record, which the superseded record names.
  Its check is not executed, because it describes a decision no longer in force.

A record whose `status` is absent, or is any other value, is rejected by the conformance
check.

### An accepted decision is superseded, never edited

In a record whose status is `accepted`, three sections are **frozen**:

- `## Decision`
- `## Agent Rules`
- `## Invariants`

Changing what any of them says requires a **new record that supersedes this one**. It is
never an edit in place. The original keeps its frozen sections byte-for-byte as accepted
and its status becomes `superseded`, naming its replacement.

Every other section may be edited: `## Context`, `## Alternatives Considered`,
`## Trade-offs Accepted`, `## Consequences`, `## Machine Check`, `## Precedence`, and
explicitly-marked post-acceptance correction sections. Repairing a check that has rotted,
correcting a fact that has since changed, and adding a cross-reference to a later record
are maintenance of an unchanged decision, not a new one.

An edit to an editable section must not change what a frozen section mandates. A
correction that would alter the decision itself is a superseding record.

In a record whose status is `concept`, nothing is frozen.

### Machine Check

`## Machine Check` opens with a context declaration, in the same bullet style as
`## Metadata`:

```text
- **context:** cli-repo
```

The context names what the check needs, and is exactly one of:

| Context | The runner executes the check with |
|---|---|
| `cli-repo` | the working directory at the root of a `hatch-cli` checkout |
| `registry-checkout` | the working directory at the root of a `hatch-skills` checkout |
| `both` | the working directory at the root of a `hatch-cli` checkout, and `$HATCH_REGISTRY` holding the path to a `hatch-skills` checkout |
| `live-github` | *nothing* — the record asserts live GitHub configuration, which is not in any checkout |
| `review-only` | *nothing* — establishing the record requires judgment about what code means, and no reviewer performs it |
| `greptile-review` | the working directory at the root of a `hatch-cli` checkout — the check establishes that the delegation to the reviewer is intact, never that the decision itself holds |

**An executable context** — `cli-repo`, `registry-checkout`, `both` — requires exactly one
fenced ` ```bash ` block in the section, followed by a line beginning `Expected result:`
stating what a passing run looks like. The command:

- must run as written, with no placeholder standing in for a path or value a reader is
  expected to substitute (`<group-folder>` and the like);
- must not be constructed so that it succeeds regardless of what it finds — a trailing
  `|| true`, or a `grep` whose only failure mode is swallowed;
- must distinguish pass from fail by exit status;
- must not stand in for a property it does not establish. A `grep` that succeeds on the
  presence of a comment, while the behavior the record asserts goes unexamined, is not a
  check.

**A non-executable context** — `live-github`, `review-only` — requires a `- **reason:**`
bullet naming why no command can establish the record, and prose describing what a
reviewer must establish instead. The runner reports these records as **unverified**,
never as passing, so a green run never overstates what was actually checked. A record
whose check cannot be automated declares that; it does not present a command that appears
to verify it.

**A delegating context** — `greptile-review` — is for a record whose verification needs
judgment about what code means *and* which names the reviewer that performs that judgment
continuously. It requires all of:

- a `- **reviewer:**` bullet naming the judge;
- exactly one fenced ` ```bash ` block followed by a line beginning `Expected result:`,
  subject to every rule an executable check is subject to above;
- prose describing what that reviewer must establish, as a `review-only` record carries.

It carries **no** `- **reason:**` bullet. `reason` exists to say why nothing can verify the
record; a delegating record has an answer to that, and the reviewer bullet is it.

The check does not establish the decision. It establishes that the delegation is intact —
that the reviewer's standards still carry a rule bound to this record, that the rule is
active, and that it names the record. A rule that is missing, inactive, or unbound fails
the check and blocks the pull request, because a record claiming a judge it no longer has
reads as covered while being unchecked.

The runner reports a delegating record whose check passes as **`JUDGE`**, counted in its
own summary bucket — never as `PASS`. The strongest claim such a record supports is that
the judgment is still being asked for, not that the decision holds. A delegating record
whose check *fails* is reported `FAIL` and blocks, like any other failing check.

### Enforcement

One status check, `decision-records`, runs on every pull request in both repositories and
blocks a failure:

| Runs in | Does |
|---|---|
| `hatch-cli` and `hatch-skills` | Verifies the whole record set conforms, then executes every check whose declared context is executable in that repository, reporting per record: passed, failed, unverified (with its reason), delegated to a named reviewer, skipped as superseded, or deferred to the other repository's run |

In `hatch-cli` that job carries one further step. It compares each record's frozen
sections between the pull request's merge base and its head, keyed on the record's status
**at the merge base**, and fails an edit to a frozen section of an accepted record. It
runs only there, because that is where the records live, and only on a pull request,
because a push to `main` has no merge base to compare against.

Conformance is evaluated across the whole record set, not only the records a pull request
touches, so a record cannot drift out of conformance without a change that names it. A
check that cannot be located, parsed, or executed is a failure — never a silent skip —
so a record dropping out of coverage is visible.

The check is blocking from the moment it lands. It protects the integrity of the decision
record set itself rather than a pre-launch cleanup window, so it had no advisory period.

Run the conformance check and every machine check locally with:

```bash
node scripts/adr/check.mjs --registry ../hatch-skills
```

Run the immutability comparison against whatever you branched from:

```bash
node scripts/adr/check-immutability.mjs --base main
```

## Index

| # | id | component | status | path |
|---|----|-----------|--------|------|
| 0001 | `0001-harness-suffix-convention` | skill-registry-harness-targeting | superseded | [`0001-harness-suffix-convention.md`](0001-harness-suffix-convention.md) |
| 0002 | `0002-cli-runtime-nodejs` | cli-runtime | accepted | [`0002-cli-runtime-nodejs.md`](0002-cli-runtime-nodejs.md) |
| 0003 | `0003-registry-github-tarball-fetch` | registry-data | accepted | [`0003-registry-github-tarball-fetch.md`](0003-registry-github-tarball-fetch.md) |
| 0004 | `0004-github-vcs-platform` | version-control | accepted | [`0004-github-vcs-platform.md`](0004-github-vcs-platform.md) |
| 0005 | `0005-auth-token-env-file-precedence` | auth | accepted | [`0005-auth-token-env-file-precedence.md`](0005-auth-token-env-file-precedence.md) |
| 0006 | `0006-npm-public-distribution` | cli-distribution | accepted | [`0006-npm-public-distribution.md`](0006-npm-public-distribution.md) |
| 0007 | `0007-github-actions-deployment` | deployment | accepted | [`0007-github-actions-deployment.md`](0007-github-actions-deployment.md) |
| 0008 | `0008-trunk-based-branch-protection` | branching-strategy | accepted | [`0008-trunk-based-branch-protection.md`](0008-trunk-based-branch-protection.md) |
| 0009 | `0009-skill-versioning-semver-tags` | registry-versioning | accepted | [`0009-skill-versioning-semver-tags.md`](0009-skill-versioning-semver-tags.md) |
| 0010 | `0010-manifest-schema-migrations` | data-migrations | accepted | [`0010-manifest-schema-migrations.md`](0010-manifest-schema-migrations.md) |
| 0011 | `0011-vitest-testing` | testing | accepted | [`0011-vitest-testing.md`](0011-vitest-testing.md) |
| 0012 | `0012-biome-formal-checks` | formal-checks | accepted | [`0012-biome-formal-checks.md`](0012-biome-formal-checks.md) |
| 0013 | `0013-registry-group-structure-and-permanence` | skill-registry-group-structure | accepted | [`0013-registry-group-structure-and-permanence.md`](0013-registry-group-structure-and-permanence.md) |
| 0014 | `0014-registry-collision-detection` | registry-collision-detection | accepted | [`0014-registry-collision-detection.md`](0014-registry-collision-detection.md) |
| 0015 | `0015-import-harness-selection-flag` | manifest-bootstrap | accepted | [`0015-import-harness-selection-flag.md`](0015-import-harness-selection-flag.md) |
| 0016 | `0016-group-member-manifest-format` | skill-registry-group-structure | superseded | [`0016-group-member-manifest-format.md`](0016-group-member-manifest-format.md) |
| 0017 | `0017-manifest-schema-v2-group-membership` | data-migrations | accepted | [`0017-manifest-schema-v2-group-membership.md`](0017-manifest-schema-v2-group-membership.md) |
| 0018 | `0018-manifest-content-hash-local-edit-detection` | data-migrations | superseded | [`0018-manifest-content-hash-local-edit-detection.md`](0018-manifest-content-hash-local-edit-detection.md) |
| 0019 | `0019-registry-removed-metadata-flag` | skill-registry-group-structure | accepted | [`0019-registry-removed-metadata-flag.md`](0019-registry-removed-metadata-flag.md) |
| 0020 | `0020-standalone-version-pin-manifest-and-parsing` | data-migrations | accepted | [`0020-standalone-version-pin-manifest-and-parsing.md`](0020-standalone-version-pin-manifest-and-parsing.md) |
| 0021 | `0021-block-first-time-import-of-removed-target` | skill-registry-group-structure | accepted | [`0021-block-first-time-import-of-removed-target.md`](0021-block-first-time-import-of-removed-target.md) |
| 0022 | `0022-remove-force-flags-not-prompt` | cli-remove-command | accepted | [`0022-remove-force-flags-not-prompt.md`](0022-remove-force-flags-not-prompt.md) |
| 0023 | `0023-remove-harness-drop-unconditional` | cli-remove-command | accepted | [`0023-remove-harness-drop-unconditional.md`](0023-remove-harness-drop-unconditional.md) |
| 0024 | `0024-registry-collision-predicate` | registry-collision-detection | accepted | [`0024-registry-collision-predicate.md`](0024-registry-collision-predicate.md) |
| 0025 | `0025-harness-shadowing-risk-accepted` | registry-collision-detection | accepted | [`0025-harness-shadowing-risk-accepted.md`](0025-harness-shadowing-risk-accepted.md) |
| 0026 | `0026-git-optional-dependency` | version-control-integration | accepted | [`0026-git-optional-dependency.md`](0026-git-optional-dependency.md) |
| 0027 | `0027-testing-skill-convention` | skill-registry-group-structure | accepted | [`0027-testing-skill-convention.md`](0027-testing-skill-convention.md) |
| 0028 | `0028-registry-discovery-live-walk` | registry-discovery | accepted | [`0028-registry-discovery-live-walk.md`](0028-registry-discovery-live-walk.md) |
| 0029 | `0029-greptile-continuous-review` | continuous-code-review | superseded | [`0029-greptile-continuous-review.md`](0029-greptile-continuous-review.md) |
| 0030 | `0030-greptile-review-machine-check-context` | decision-record-convention | accepted | [`0030-greptile-review-machine-check-context.md`](0030-greptile-review-machine-check-context.md) |
| 0031 | `0031-greptile-review-with-repo-cluster-context` | continuous-code-review | accepted | [`0031-greptile-review-with-repo-cluster-context.md`](0031-greptile-review-with-repo-cluster-context.md) |
| 0032 | `0032-group-pointer-caret-constraint` | skill-registry-group-structure | accepted | [`0032-group-pointer-caret-constraint.md`](0032-group-pointer-caret-constraint.md) |
| 0033 | `0033-harness-suffix-convention-and-registry-directories` | skill-registry-harness-targeting | accepted | [`0033-harness-suffix-convention-and-registry-directories.md`](0033-harness-suffix-convention-and-registry-directories.md) |
| 0034 | `0034-content-hash-recorded-by-every-placing-command` | data-migrations | accepted | [`0034-content-hash-recorded-by-every-placing-command.md`](0034-content-hash-recorded-by-every-placing-command.md) |
