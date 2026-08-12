# Registry collision detection: one CLI-owned check, invoked from both repos

## Metadata

- **id:** 0014-registry-collision-detection
- **component:** registry-collision-detection
- **status:** accepted
- **applies_to:** UC-5's required CI check in the skill-content repo (hatch-skills); a new required CI check in the Hatch CLI repo (hatch-cli), triggered on harness-registry/resolution changes; the Hatch CLI's resolution logic, which must be exposed as an invocable check rather than remaining internal to `hatch import`'s command handling
- **decision_record:** `docs/architecture/decisions/0014-registry-collision-detection.md`

## Decision

One real implementation of the harness-resolution/collision-detection logic exists, in the Hatch CLI (hatch-cli repo). It is invoked from two directions; it is never reimplemented a second time.

- **Registry-side check** (hatch-skills' own CI, PR-time, required status check — the check UC-5 itself specifies): installs the currently published `@ai-wise/hatchcli` — always latest, never a pinned version — and runs its resolve-everything-into-a-simulated-test-project collision check against hatch-skills' own PR'd tree, once per harness the CLI currently supports. Blocks the registry PR from merging on a detected collision.
- **CLI-side check** (hatch-cli's own CI, triggered specifically on any change touching the harness registry or the resolution logic — not unconditionally on every CLI PR): fetches the full current hatch-skills tree and runs the same check using the PR's proposed new resolution logic, once per harness. Blocks the hatch-cli PR from merging if it would retroactively collide with existing registry content.

hatch-cli's CI is granted a read-scoped credential for the private hatch-skills repo, used only by this new check.

## Context

UC-5 (`docs/use-cases/prevent-path-collisions.md`) requires a CI check in hatch-skills that blocks a PR introducing a destination-path collision, running synchronously and before merge.

That check's correctness depends on exactly the same two things `hatch import`'s own resolution logic depends on: [0001-harness-suffix-convention](0001-harness-suffix-convention.md)'s harness-registry reserved-code set and its suffix-stripping resolution algorithm. A hand-written second implementation of this logic, living only in hatch-skills, would risk silent drift from the CLI's real behavior over time.

The harness-registry's reserved-code set only ever grows ([0001](0001-harness-suffix-convention.md): new codes are added, never removed) — meaning previously-safe registry content can become retroactively unsafe the moment a new code is reserved. A check that only runs at registry-PR-time, against a fixed or pinned CLI version, cannot detect this direction at all: it needs to be caught when the CLI's own resolution behavior changes, not when the registry's content changes.

[0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md)'s name-permanence rule is what makes the CLI-side check's failure mode always remediable: the fix is always "pick a different harness code before merging," never "go modify existing registry content," since the latter is now permanently disallowed.

[0006-npm-public-distribution](0006-npm-public-distribution.md) already established `@ai-wise/hatchcli` is public on npm with no embedded secrets, making it freely installable by hatch-skills' CI with no credential of its own. [0007-github-actions-deployment](0007-github-actions-deployment.md) established that hatch-skills' own CI needs no external credentials — this record doesn't change that for the registry-side check, but it does add a new credential requirement on the hatch-cli side that [0007](0007-github-actions-deployment.md) did not anticipate.

## Alternatives Considered

- **Pin hatch-skills' registry-side check to a fixed, specific published hatchcli version.** Not chosen: freezes the check against a stale, incomplete reserved-code set as the registry and the CLI both grow — strictly worse than always resolving against latest, and was the first idea proposed in this conversation before the flaw was caught.
- **Extract a third, separately-published shared package** (e.g. a dedicated harness-resolver package) that both repos depend on. Not chosen: disproportionate operational overhead — a third artifact to version, publish, and maintain — for a genuinely small piece of logic, inconsistent with this project's repeated preference elsewhere for the fewest new moving parts ([0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) rejected a bespoke server for the same reason; [0005-auth-token-env-file-precedence](0005-auth-token-env-file-precedence.md) rejected OS keychain integration for the same reason).
- **Duplicate the logic in hatch-skills with a separate conformance/golden-file test** verifying agreement between two implementations. Not chosen: does not satisfy UC-5's synchronous, before-merge blocking requirement on its own — the conformance test still has to execute somewhere, reintroducing one of the other options as the real mechanism — and does not address the retroactive-collision direction at all without a CLI-side check regardless.
- **Registry-side check only, no CLI-side check.** Not chosen: leaves the retroactive-collision failure mode (a new harness code silently colliding with existing, permanent registry content) completely undetected until it actually breaks an import somewhere.

## Trade-offs Accepted

- **Prompt coherence:** high — "one real implementation, checked from both directions" is a single mental model; an agent working in either repo can state the whole rule in one sentence.
- **Failure surface:** hatch-cli's CI now depends on a stored read-scoped credential for a second, private repo — a new secret to provision and rotate that did not exist before this record. This is a partial departure from [0007](0007-github-actions-deployment.md)'s "no external credentials" property, which still holds for the registry-side check; the new dependency is entirely on the CLI side.
- **Reversibility:** high — both checks are ordinary CI workflow steps; swapping the underlying mechanism later touches two workflow files, not application logic.
- **Operational simplicity:** no new package to publish or version; reuses the npm/GitHub Actions infrastructure already stood up in the project's infrastructure batches.

## Consequences

- The Hatch CLI must expose its resolution/collision-check logic as a directly invocable surface (a subcommand or an importable export) — it cannot remain buried inside `hatch import`'s own command-handling code, since hatch-skills' CI needs to call it independently of a full `hatch import` invocation.
- hatch-skills' CI workflow gains a third required status check (alongside `version-check` from [0009](0009-skill-versioning-semver-tags.md) and the name-permanence check from [0013](0013-registry-group-structure-and-permanence.md)): the collision check, running once per supported harness.
- hatch-cli's CI workflow gains a new job, triggered on changes to the harness registry or resolution logic specifically, requiring a new read-scoped GitHub credential for the private hatch-skills repo — this credential must be provisioned (e.g. as a repo secret) as part of building this.
- [0007-github-actions-deployment](0007-github-actions-deployment.md) is amended by this record for the hatch-cli side only: its "no external credentials" property no longer holds unconditionally for that repo's CI — it still holds for the npm-release workflow and for hatch-skills' own checks.
- Both checks must run once per harness the CLI currently supports, not once globally, since resolution is harness-specific.

## Agent Rules

- MUST implement the harness-resolution/collision-detection logic exactly once, in the Hatch CLI, exposed as an invocable check (subcommand or export) — MUST NOT reimplement or hand-copy this logic into the skill-content repo.
- MUST run hatch-skills' registry-side check against the currently published (latest) `@ai-wise/hatchcli` — MUST NOT pin it to a fixed version.
- MUST run both the registry-side and CLI-side checks once per harness the CLI currently supports, not once globally.
- MUST trigger the CLI-side check on any hatch-cli PR touching the harness registry or resolution logic, and MUST block that PR on a detected collision against the current hatch-skills tree.
- MUST scope hatch-cli's credential for reading the private hatch-skills repo to read-only access, used only by this check.

## Invariants

- **MUST block a hatch-cli PR that would retroactively collide with existing registry content.** Becomes irreversible-to-relax once: real registry content and real reserved harness codes exist that this check protects — disabling it would let a future harness-code addition silently break resolution for already-published content. Enforcement mechanism: hatch-cli's own CI job, triggered on harness-registry/resolution changes, intended as a required status check. Current mode: **not-yet-built** — [Batch 10](../../build-plan.md) (`docs/build-plan.md`), which implements this check on both sides, is still planned, not built. `pre-launch-audit` should re-verify this once Batch 10 lands, since its documented mode will need updating here.

## Machine Check

```bash
grep -rln "hatchcli" ../hatch-skills/.github/workflows/*.yml
grep -rEln "harness-registry|resolution" .github/workflows/*.yml
```

Expected result (first command run from the hatch-cli checkout, second from the same): hatch-skills' CI workflow shows a job installing/invoking `@ai-wise/hatchcli`'s collision check; hatch-cli's CI workflow shows a separate job path-filtered to the harness registry/resolution code, fetching the hatch-skills repo and invoking the same check. Absence of either indicates the two-sided check isn't wired up as decided.

## Precedence

- Builds on [0001-harness-suffix-convention](0001-harness-suffix-convention.md) (the resolution algorithm and harness registry this check invokes) and [0013-registry-group-structure-and-permanence](0013-registry-group-structure-and-permanence.md) (name permanence, which keeps the CLI-side check's failure mode always remediable).
- Amends [0007-github-actions-deployment](0007-github-actions-deployment.md) for the hatch-cli side: that record's "no external credentials" property is narrowed by this record's new CLI-side credential requirement. [0007](0007-github-actions-deployment.md) has been updated to cross-reference this record.
- Implements the required status check [UC-5](../../use-cases/prevent-path-collisions.md) specifies for the skill-content repo.
- No known conflicting decision records.
