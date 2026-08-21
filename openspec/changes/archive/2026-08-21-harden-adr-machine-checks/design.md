## Context

See proposal.md — Why. What follows is the state a design has to work with.

The records already conform more than expected. Extracting the first fenced `bash` block under each `## Machine Check` heading succeeds on **28 of 28** with no unparsed records and no record carrying more than one block. The convention this change formalizes is therefore mostly already observed; the work is making it explicit, enforced, and executed rather than inventing it.

What the same inventory exposed is that the checks disagree about where they run. Grouped by what each one actually needs:

| Needs | Records |
|---|---|
| The CLI repo only | 0001 0002 0003 0005 0006 0007 0010 0011 0012 0015 0017 0018 0020 0022 0026 |
| A registry checkout | 0009 0013 0016 0019 0027 0028 |
| Both repos at once | 0014 0024 |
| Live GitHub configuration | 0004 0008 |
| A built CLI and a prepared project | 0021 |
| Human judgment | 0014 0021 0023 0024 0025 |

Nothing in a record states which of these applies. [0024](../../../docs/architecture/decisions/0024-registry-collision-predicate.md)'s check reads `../hatch-cli/src/registry/*.ts`, so it is written as though it runs from the registry repo, while every neighbouring check assumes the CLI repo — an inconsistency invisible today because nothing executes either. The last two rows overlap deliberately: some records need more than a repository, and some need more than a command.

## Goals / Non-Goals

**Goals:**

- A record's execution context is declared in the record, not inferred by the runner.
- One cross-repo mechanism, not a second one invented here.
- A green run means every record was accounted for, including the ones nothing verified.

**Non-Goals:**

- Converting judgment-type checks into scripts. The proposal excludes them; this design must make their exclusion *visible* rather than quietly dropping them.
- Widening any CI credential. [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md) scoped its registry token to Contents-read specifically so the CLI repo's CI could not reach further, and that constraint holds here.
- Verifying that a record's prose is *true* — only that its declared check passes.

## Decisions

### Each record declares its execution context

A `## Machine Check` section gains a declaration line naming where the check runs and what it requires, in the same list style the records' existing `## Metadata` section already uses. The runner reads it rather than guessing from the command's contents.

The context values follow the inventory above: the CLI repo, a registry checkout, both, live GitHub configuration, or review-only.

*Alternative — infer the context by pattern-matching the command* (does it mention `../hatch-skills`, does it call `gh api`). Rejected: it is exactly the "second thing that must agree with the first" failure [0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md), [0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) and [0028](../../../docs/architecture/decisions/0028-registry-discovery-live-walk.md) each rejected an index for, and it silently misclassifies 0024 today.

*Alternative — put the context in the fence info string* (```` ```bash runs-in=hatch-cli ````). Rejected: it renders as noise in every markdown viewer, and the records are read by humans far more often than by the runner.

### The cross-repo mechanism follows 0014's shape, but not its npm step

The CLI repo's job obtains the registry exactly as [0014](../../../docs/architecture/decisions/0014-registry-collision-detection.md)'s CLI-side check does: a checkout using the existing read-scoped `HATCH_SKILLS_READ_TOKEN`.

The registry repo's job cannot mirror 0014's other half. That check installs the published `@ai-wise/hatchcli` and needs only the CLI's *logic*, which ships in `dist/`. This runner needs the CLI's logic **and the records themselves**, and the package publishes neither: `package.json` declares `files: ["dist"]`, and a `npm pack --dry-run` contains zero files under `docs/architecture/decisions/`. Installing from npm would leave the runner with nothing to parse.

So the registry job checks out the CLI repo at its **latest release tag**, resolved at run time rather than written into the workflow. That supplies both inputs, and keeps the property 0014 was protecting — never pinned to a version that silently goes stale — while avoiding a dependency on unreleased work. Because the CLI repo is public ([0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md)), this checkout needs no credential, so the registry repo's CI keeps the no-external-credentials property [0007](../../../docs/architecture/decisions/0007-github-actions-deployment.md) established for it.

*Alternative — add the records to the package's `files` array.* Rejected: it ships governance documents to every consumer of the CLI, who has no use for them, purely to satisfy a CI job.

*Alternative — the registry repo checks out the CLI repo's default branch.* Rejected: it makes the registry's CI depend on the CLI's unreleased working state, so a broken commit on the CLI's `main` would block unrelated registry PRs. The release tag avoids this while still tracking forward.

*Alternative — run every check from the CLI repo only, checking out the registry.* Rejected: registry pull requests would then get no decision-record gate at the moment content is authored, which is the point at which a violation is cheapest to fix.

### Checks needing live GitHub configuration are declared, not run

[0004](../../../docs/architecture/decisions/0004-github-vcs-platform.md) reads repository visibility and [0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md) reads branch protection. Both are live organisation state rather than anything in a diff, and reading branch protection needs an Administration-scoped token — materially broader than the Contents-read token 0014 was careful to keep narrow.

These are classified alongside the judgment-type records: reported as **unverified, with the reason named**, never as passing. The spec's requirement that a check which cannot be executed is a failure rather than a silent skip is satisfied by the declaration — a record that *declares* it needs live configuration is accounted for; a record that declares an executable check and then cannot run it still fails.

*Alternative — provision an Administration-scoped token.* Rejected for now: it buys automated verification of two records at the cost of a standing credential with write-adjacent reach over both repositories, against a risk (someone silently flipping the registry to public) that has no live vector on a single-maintainer org. Revisit if the org gains members.

### Immutability is checked by comparing frozen sections against the merge base

The runner extracts the **Decision**, **Agent Rules** and **Invariants** sections from each record at the merge base and at the head of the pull request, and compares them. A difference in a record whose base-commit status was `accepted` fails, naming the record, the section, and supersession as the remedy.

Comparing *section content* rather than whole-file diffs is what allows a rotted check to be repaired and a cross-reference to be added in the same commit that must not touch the decision.

The base-commit status is what governs, not the head status. Otherwise a change could flip a record to `concept`, rewrite its Decision, and flip it back in one commit.

This check runs only in the CLI repo, since that is where the records live.

### A superseded record's check is reported, not executed

A `superseded` record describes a decision no longer in force, so its check may legitimately fail against current reality. The runner reports these by name and does not execute them. They remain in the corpus for the history, which is why [0013](../../../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md)-style permanence applies to records as much as to registry names.

### Normalization touches only editable sections

The bootstrap is safe by construction: adding a `status` value touches `## Metadata`, and adding a context declaration touches `## Machine Check`. Neither is frozen, so normalizing all 28 records does not require superseding any of them. Should the reclassification pass conclude that a record's Decision was never actually settled, that record becomes `concept` — a status change, not a decision change.

## Risks / Trade-offs

- **The runner executes shell from a markdown file.** → The records are trusted, first-party content in a branch-protected repository, and the runner executes them in CI where a malicious PR would already have far easier paths. Contributors are the maintainer and agents acting for them. Accepted, and worth restating rather than discovering later.
- **A check can pass for the wrong reason and nothing notices.** → This is the failure the excluded records already demonstrate: 0024's greps a comment. Mitigated by the contract's rule against checks whose success is unrelated to the asserted property, but the contract cannot detect every instance. The residue is greptile's.
- **Blocking from day one on a suite that has never run in CI.** → Every check was executed against the real tree during the review that produced this change, so the suite starts green. The genuine risk is environmental rather than logical: `gh`, `node`, and a registry checkout must all be present, which is why context declaration comes before wiring.
- **Two records need both repositories, so a registry PR can be blocked by CLI state and vice versa.** → Already true of 0014's collision check, and accepted there; this adds no new class of coupling.
- **The immutability rule makes correcting a mistaken decision heavier.** → Deliberate: that is the property being bought. The freeze covers only the three normative sections, so the everyday corrections this review performed stay possible.

## Migration Plan

1. Normalize the records — status values and context declarations — before anything executes them, so the first run has a conforming corpus to read.
2. Land the runner reporting only, so its output can be compared against the review's manual results.
3. Wire both CI jobs and add them to branch protection ([0008](../../../docs/architecture/decisions/0008-trunk-based-branch-protection.md)) once a full run is green.

Rollback is removing the required checks; nothing about the records themselves needs reverting, since a declared status and a declared context are useful whether or not a runner reads them.

## Open Questions

- **Whether a scheduled run should supplement the per-PR run.** Records verifying live state drift without any pull request. Deferrable: it changes when the runner is invoked, not what it does or how the records are shaped.
- **Whether the contract should eventually require normative language to live only in Agent Rules.** Several records today put obligations in `## Consequences`, which the freeze does not cover. Tightening this later is additive and does not change this change's specs or tasks.
