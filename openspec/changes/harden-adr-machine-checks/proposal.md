## Why

Every one of the 28 architecture decision records ends with a `## Machine Check` section holding a real shell command and its expected result. Nothing executes any of them. They are documentation, and a check nobody runs cannot fail — so when one stops being true, nothing says so.

A review on 2026-08-21 found eight had rotted exactly that way: [0017](../../../docs/architecture/decisions/0017-manifest-schema-v2-group-membership.md) asserted `"schemaVersion": 2` long after the migration chain reached 4, making it unsatisfiable by any live manifest; [0010](../../../docs/architecture/decisions/0010-manifest-schema-migrations.md), [0018](../../../docs/architecture/decisions/0018-manifest-content-hash-local-edit-detection.md) and [0020](../../../docs/architecture/decisions/0020-standalone-version-pin-manifest-and-parsing.md) grepped a `hatch.manifest.json` that exists in neither repository; [0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md) and [0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) still carried literal `<group-folder>` placeholders; [0003](../../../docs/architecture/decisions/0003-registry-github-tarball-fetch.md) ended in `|| true`, so it exited zero whatever it found. Those eight are now repaired and each verified against the real tree, but they remain what they were before: commands a human must paste into a shell to learn anything.

The previous attempt at coverage was a manual audit written to `docs/pre-launch-audit.md` on 2026-08-12. Within weeks it asserted that the collision check was unbuilt while that check was live and required on both repositories, and it was removed. A hand-run audit is a photograph of a moving thing.

The same review exposed a second, quieter gap: it edited fifteen records whose status is `accepted`, and no rule said whether that was permitted. Four records already carry `### … correction (post-acceptance)` sections and [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md) states outright that "0007 has been updated to cross-reference this record", so the corpus already distinguishes correcting a record from changing a decision. That distinction has never been written down or enforced, which means nothing currently prevents a settled decision from being quietly rewritten instead of superseded.

Both gaps have the same fix: give the records a shape a machine can read, and then read them on every pull request.

## What Changes

- **A decision-record document contract.** Required sections, and a machine-check block convention precise enough to extract and execute: one fenced `bash` block per record, in a known section, with its expected result stated beneath it.
- **A status lifecycle.** `status` takes `concept`, `accepted`, or `superseded`. A `concept` record is working material and freely editable. An `accepted` record is settled.
- **An immutability boundary for accepted records.** The **Decision**, **Agent Rules** and **Invariants** sections of an accepted record are frozen; changing what any of them says requires a superseding record, never an edit. **Machine Check**, **Precedence**, and explicitly-marked post-acceptance correction sections stay editable, because repairing a rotted check and adding a cross-reference to a later record are maintenance of an unchanged decision rather than a new one. **BREAKING** for authoring habits: editing a frozen section becomes a CI failure rather than an ordinary commit.
- **A runner that executes the checks.** It parses each record's machine-check block and runs it, reporting per-record pass/fail. Wired into CI in both repositories and **blocking from day one** — every check currently passes, so it starts green.
- **Machine checks over the corpus itself.** Contract conformance across all records, and frozen-section immutability enforced by diffing each accepted record against its base commit.
- **A reclassification pass.** All 28 existing records are reviewed during implementation and assigned a status, rather than being assumed `accepted` wholesale.

Explicitly out of scope: the five judgment-type checks ([0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md), [0021](../../../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md), [0023](../../../docs/architecture/decisions/0023-remove-harness-drop-unconditional.md), [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md), [0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md)) that ask a reader to judge whether code *means* the right thing. 0023 already declares itself manual; 0024 greps for a phrase in a comment and passes whether or not the predicate behind it is correct. Pretending those are scripts is how a green check comes to mean nothing. They belong to `adopt-greptile-invariant-review`, whose own open question — *"whether an ADR's Machine Check is the better hook"* — this change answers for the other twenty.

## Capabilities

### New Capabilities

- `decision-record-convention`: the structural contract every architecture decision record follows, the status lifecycle that separates working material from settled decisions, the immutability boundary an accepted record guarantees, and the requirement that each record's machine check is executed continuously rather than described.

### Modified Capabilities

None. This change governs how decisions are recorded and verified; it does not alter what the CLI or the registry does, so no existing capability's requirements change.

## Impact

- **`hatch-cli`**: a new runner and a new CI job. All 28 records under `docs/architecture/decisions/` may need shape normalization to satisfy the contract. `README.md`'s index gains the status column's new values.
- **`hatch-skills`**: a new CI job running the registry-side checks. Those checks live in records that sit in `hatch-cli`, so the job needs the records available — the same cross-repo shape [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md) already established for the collision check, and a decision design.md must settle.
- **The `capture-adrs` skill**: it writes these records, so it must learn the status field, the contract, and the rule that an accepted decision is superseded rather than edited.
- **Branch protection ([0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md))**: new required status checks on `main` in both repositories.
- **Credentials**: several checks are not code greps at all. [0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md)'s reads repository visibility and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)'s reads branch protection, both via `gh api`; [0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)'s reads the registry's git history. Which checks can run unauthenticated, and what a check that needs live GitHub state is allowed to assume, is a scoping question for design.
- **`adopt-greptile-invariant-review`**: narrowed rather than blocked. Once this lands, that proposal covers the judgment-type residue and the live-configuration invariants a diff cannot see.
