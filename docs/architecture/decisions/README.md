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
| `review-only` | *nothing* — establishing the record requires judgment about what code means |

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

### Enforcement

Two checks run on every pull request, in both repositories, and block a failure:

| Check | Runs in | Does |
|---|---|---|
| `decision-records` | `hatch-cli` and `hatch-skills` | Verifies the whole record set conforms, then executes every check whose context is executable in that repository and reports per record: passed, failed, unverified (with its reason), or skipped as superseded |
| `decision-record-immutability` | `hatch-cli` | Compares each record's frozen sections between the merge base and the pull-request head, keyed on the record's status **at the merge base**, and fails an edit to a frozen section of an accepted record |

Conformance is evaluated across the whole record set, not only the records a pull request
touches, so a record cannot drift out of conformance without a change that names it. A
check that cannot be located, parsed, or executed is a failure — never a silent skip —
so a record dropping out of coverage is visible.

Both checks are blocking from the moment they land. They protect the integrity of the
decision record set itself rather than a pre-launch cleanup window, so neither had an
advisory period.

Run the whole thing locally with:

```bash
node scripts/adr/check.mjs
```

## Index

| # | id | component | status | path |
|---|----|-----------|--------|------|
| 0001 | `0001-harness-suffix-convention` | skill-registry-harness-targeting | accepted | [`0001-harness-suffix-convention.md`](0001-harness-suffix-convention.md) |
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
| 0016 | `0016-group-member-manifest-format` | skill-registry-group-structure | accepted | [`0016-group-member-manifest-format.md`](0016-group-member-manifest-format.md) |
| 0017 | `0017-manifest-schema-v2-group-membership` | data-migrations | accepted | [`0017-manifest-schema-v2-group-membership.md`](0017-manifest-schema-v2-group-membership.md) |
| 0018 | `0018-manifest-content-hash-local-edit-detection` | data-migrations | accepted | [`0018-manifest-content-hash-local-edit-detection.md`](0018-manifest-content-hash-local-edit-detection.md) |
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
