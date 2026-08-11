# Build Plan

## Batch 1 — Infrastructure & Skeleton

**Status:** done

**Contents:**
- GitHub repo `AI-Wise-IT/hatch-cli` created (public — see ADR-0004 correction below).
- CLI scaffold: `package.json` (`@ai-wise/hatchcli`), TypeScript strict config, Biome (lint/format), Vitest with a first unit test, a minimal CLI entrypoint that builds, runs, and prints its own version.
- `src/manifest-migrations/` migration-function registry skeleton (ADR-0010) — no migrations registered yet; schema version 1 is the first shape `hatch new` will write.
- Local pre-commit hook (`simple-git-hooks` + `lint-staged`), auto-installed on `npm install` via a `prepare` script (ADR-0012).
- GitHub Actions: `ci.yml` (lint, typecheck, test, build on every push/PR) and `release.yml` (publishes only on a pushed `v*` tag, via npm Trusted Publishing/OIDC — no stored npm token) (ADR-0007).
- Branch protection on `main`: PR required, the `checks` status check required, 0 approving reviews required, admins enforced, force-push and deletion disabled (ADR-0008).
- `@ai-wise/hatchcli` published publicly on npm: `0.0.0` as a one-time manual bootstrap publish (required to claim the name before a Trusted Publisher could be configured), `0.0.1` as the first fully CI-driven, OIDC-authenticated release.

**Rationale:** Always the first batch, unconditionally — nothing else can be reviewed as a coherent, demoable whole once quality gates are meant to be active until the gates themselves exist. This is the walking skeleton (Cockburn): a thin, real connection through every layer — repo, CI, branch protection, release pipeline — proven end to end before any product/use-case code exists. See `plan-build-batches/references/batching-criteria.md` for the full reasoning.

**Verification:** All of the following were directly observed, not inferred from config, over the course of building this batch:
- Pre-commit hook: staged a deliberate TypeScript type error and confirmed the commit was blocked (`tsc --noEmit` failing after `lint-staged` auto-fixed formatting).
- CI: watched `ci.yml` run live in GitHub Actions on a push to `main` and on multiple PRs — lint, typecheck, test, and build all passing.
- Branch protection: attempted a direct push to `main` and confirmed it was rejected (`GH006: Protected branch update failed`); then opened a PR with the same change, watched the required `checks` status check pass, and confirmed it merged with zero approving reviews.
- Release pipeline: pushed the `v0.0.1` git tag, watched `release.yml` run, and confirmed `@ai-wise/hatchcli@0.0.1` appeared on the public npm registry with an `attestations.provenance` field (proof of OIDC trusted-publish origin, not a manual upload).
- Ran `npx @ai-wise/hatchcli@latest` for real and confirmed it printed the correct, dynamically-read version and exited `0`.

**Notes — architecture corrections discovered during this batch:**
- ADR-0006: package name corrected twice — `hatch-cli` was unavailable, then unscoped `hatchcli` was rejected by npm's anti-typosquatting check; settled on the scoped `@ai-wise/hatchcli`.
- ADR-0004: the Hatch CLI repo's visibility corrected from private to public — GitHub branch protection requires a paid plan for a private repo on the org's Free tier; the skill-content repo remains private.
- ADR-0007: publish authentication corrected from a stored `NPM_TOKEN` secret to npm Trusted Publishing (OIDC) — `npm token create` is blocked for accounts on granular access tokens, and a stored long-lived token is exactly what Trusted Publishing exists to eliminate.

Out of scope for this batch: the skill-content repo (a separate GitHub repo, not yet created) needs its own infrastructure batch when that work starts — including its own resolution of the same private-repo-vs-branch-protection constraint hit here.

## Batch 2 — Skill-Content Registry Infrastructure & Skeleton

**Status:** done

**Contents:**
- GitHub repo `AI-Wise-IT/hatch-skills` created (private, per ADR-0004 — its privacy is load-bearing, unlike the CLI repo).
- Local folder created at `C:\Users\simon\Documents\Programming\Projects\hatch-skills`, initialized as its own git repository (separate from the `hatch` / `hatch-cli` repo).
- Repo skeleton: `README.md` documenting the harness-suffix layout (ADR-0001) and per-folder `skill.json` versioning (ADR-0009); no skill/group product content yet.
- `.github/workflows/ci.yml` (ADR-0007), two jobs:
  - `version-check` (PR-time, required status check): fails if any top-level folder with a `skill.json` changed in the PR without its `version` field also changing, per ADR-0009. Needs no external credentials — reads only the checkout CI already has.
  - `tag-versions` (merge-time, runs on push to `main`): pushes a `<name>@<version>` git tag for every skill/group folder whose version changed in that push, via the repo's own `GITHUB_TOKEN` (`permissions: contents: write` set at job level).
  - Both jobs share one script, `scripts/check-version-bump.mjs` (Node, no dependencies), parameterized by `check`/`tag` mode and `BASE_SHA`/`HEAD_SHA` env vars; guards the all-zero `before` SHA GitHub sends on a repo's first push.
- Branch protection on `main`: PR required, the `version-check` status check required, 0 approving reviews required, admins enforced, force-push and deletion disabled (ADR-0008) — same policy as the CLI repo's Batch 1, applied here to a private repo.

**Rationale:** Same walking-skeleton reasoning as Batch 1, applied to the registry's own repo: UC-1 (bootstrap fetches a fixed skill from the registry), UC-3 (import fetches arbitrary skill/group content), and UC-5 (a CI check that lives *inside* this repo) all need this repo to be real, not projected, before their own batches can be sequenced or built. `plan-build-batches` paused specifically on this gap — see its conversation prior to this batch. The version-bump-check and tag-push automation (ADR-0009) are cross-cutting versioning infrastructure, in the same category as Batch 1's CI/lint/test scaffolding — not product behavior. UC-5's own destination-path-collision detection logic is deliberately *not* built here; it remains its own later use-case batch, added as a second required status check alongside `version-check` when that batch is built.

**Notes — architecture correction discovered during this batch:**
- ADR-0004 anticipated that "the skill-content repo, if it also needs branch protection, will hit the same [private-repo] plan constraint" the CLI repo hit, since ADR-0004's resolution there (make the repo public) isn't available for this repo. Confirmed: at the time this batch started, org `AI-Wise-IT` was already on GitHub's Team plan, so branch protection on this private repo succeeded on the first attempt with no 403 — no ADR correction was actually needed. Recorded here in case the org plan ever changes and this resolution needs re-litigating.

**Verification:** All of the following were directly observed, not inferred from config:
- Direct push to `main`: attempted, rejected — `GH006: Protected branch update failed`, `Required status check "version-check" is expected.`
- `version-check` catches a missing bump: opened a PR editing an existing skill folder's content without changing its `skill.json` version — CI failed with `Version not bumped for changed skill/group folder(s): - _verify-example`, and GitHub reported the PR `mergeStateStatus: BLOCKED`.
- `version-check` passes a correct bump: same PR, after bumping the version — CI passed, PR merged (0 approving reviews required, as configured).
- `version-check` passes a new folder and a folder deletion without requiring special-casing: a first PR adding a new skill folder at an initial version passed; a later cleanup PR deleting that folder entirely also passed.
- `tag-versions` fires on merge: after merging the PR that introduced `_verify-example` at version `1.0.0`, tag `_verify-example@1.0.0` appeared on the repo automatically; after merging the version-bump fix, `_verify-example@1.0.1` also appeared — both via the workflow's own `GITHUB_TOKEN`, no manual push.
- All verification used a temporary `_verify-example` folder across three PRs (add, fix-after-fail, delete), merged and then removed in a final cleanup PR — `main` carries no fixture or placeholder skill content.

**Addendum — name-permanence check (added after [0013-registry-group-structure-and-permanence](architecture/decisions/0013-registry-group-structure-and-permanence.md) was settled):**
- `.github/workflows/ci.yml` gained a third job, `name-permanence-check` (PR-time, required status check): fails if any top-level folder with a `skill.json` present at the PR's base is missing at its head — enforcing that a published skill/group name is never deleted or renamed. Shares the same script pattern as `version-check` (`scripts/check-name-permanence.mjs`, Node, no dependencies).
- Added to branch protection's required status checks alongside `version-check`.
- Verified live: added a permanent, self-documenting fixture (`_registry-integrity-fixture/`, with a `NOTE.md` explaining why it exists and that it can never be removed through a normal PR) and merged it. Opened a PR deleting that fixture — CI failed with `Previously-published skill/group name(s) missing at HEAD: - _registry-integrity-fixture`, and GitHub reported the PR `mergeStateStatus: BLOCKED`. Closed that PR without merging, proving the deletion cannot land — `_registry-integrity-fixture` remains in `main` by design, not left over from incomplete cleanup.
- This addendum was pulled forward into this already-done batch (rather than deferred to the UC-5 batch below) because it has no CLI dependency at all — unlike the collision-detection check itself, nothing stops it from protecting the registry starting immediately.

## Batch 3 — Authenticate to the Registry

**Status:** planned

**Contents:** `hatch login` (UC-2): main flow (prompt for the registry's GitHub PAT, validate, persist per [0005-auth-token-env-file-precedence](architecture/decisions/0005-auth-token-env-file-precedence.md)) and AF-1 (invalid password).

**Rationale:** Nothing else in the CLI can be demoed without it — the PRD's own sequencing notes state login must ship before or alongside private-skill support. No dependency on any other remaining batch.

**Verification:** Run `hatch login` with a valid token — confirm `~/.hatch/credentials.json` is written (restrictive permissions, outside any project's repo tree) and a later command doesn't re-prompt. Run it again with an invalid token — confirm it's rejected and no session is established. Set `HATCH_TOKEN` to a different valid token and confirm it takes precedence over the file.

## Batch 4 — Bootstrap a New Project

**Status:** planned

**Contents:** `hatch new` (UC-1): main flow and all 5 AFs (invalid password, target path occupied, invalid harness selection, target location not writable, registry unreachable). Includes standing up `src/harness-registry.json` ([0001-harness-suffix-convention](architecture/decisions/0001-harness-suffix-convention.md)) and the harness-suffix resolution logic every later batch reuses.

**Rationale:** Depends on Batch 3 (login). Establishes the manifest, git-init/commit, and single-skill fetch/place/harness-resolution mechanism that Import extends next — the narrow-then-broad build order.

**Verification:** Run `hatch new` with valid inputs — confirm the folder, git repo, one commit, manifest recording the harness(es) and the self-doc skill, and content placed under every declared harness folder. Trigger each of the 5 AFs in turn and confirm nothing persists in any case.

## Batch 5 — Import: first-time, standalone skill

**Status:** planned

**Contents:** `hatch import <name>` (UC-3 main flow, for a single named skill) plus AF-6 (destination occupied), AF-7 (registry unreachable), AF-8 (invalid password).

**Rationale:** Depends on Batch 4 (login) and reuses/extends bootstrap's fetch/place/manifest/commit machinery to an arbitrary named skill. Deliberately scoped to standalone skills only — group/pointer handling is substantial enough (per [0013-registry-group-structure-and-permanence](architecture/decisions/0013-registry-group-structure-and-permanence.md)) to be its own batch next.

**Verification:** Import a real standalone skill — confirm placement per declared harness, manifest update with version, one commit, and a printed summary. Run against a non-git folder and confirm git gets auto-initialized. Pre-occupy a destination path with a non-Hatch file, re-run import, and confirm the documented skip/suffix behavior. Try a wrong password and an unreachable registry — confirm both abort cleanly with nothing changed.

## Batch 6 — Import: groups & pointers

**Status:** planned

**Contents:** UC-3's group-import branch (main flow step 4, "if it's a group, the whole group atomically") plus the new AF-9 (pinned-pointer version conflict), per [0013-registry-group-structure-and-permanence](architecture/decisions/0013-registry-group-structure-and-permanence.md): physically-nested and pointer members (including group-to-group pointers), visited-set-deduped traversal, always-flat unpacking into the target project, and the highest-wins-with-warning / hard-block-on-MAJOR-conflict version-resolution rule.

**Rationale:** Depends on Batch 5 (the single-skill fetch/place mechanism a group's members are unpacked through). Split out from Batch 5 because ADR-0013 added enough real complexity here (pointer graph resolution, dedup, version-conflict handling) to be its own coherent, demoable unit rather than a sub-case of standalone import.

**Verification:** Import a group with only physically-nested members — confirm every member lands as a flat, individual entry under each declared harness folder, one commit. Import a group containing a pointer to a standalone skill and a pointer to another group (exercising recursion) — confirm correct flattening with no duplicate placement. Construct a group whose pointer graph reaches the same skill name at two same-MAJOR pinned versions — confirm it resolves to the highest with a warning naming both. Construct one with a cross-MAJOR conflict — confirm the whole import aborts cleanly (nothing placed, no manifest change, no commit), naming the skill and the conflicting versions.

## Batch 7 — Import: re-import & staleness

**Status:** planned

**Contents:** UC-3 AF-1 (already up to date), AF-2 (update available), AF-3 (local edits present), AF-4 (deprecated/removed detection, clarified as a metadata flag per ADR-0013 — never a deletion).

**Rationale:** Depends on Batch 5 and Batch 6 — re-import applies uniformly to standalone skills and groups, so it needs both already working to verify against.

**Verification:** Re-import something already at the latest version — confirm a no-op, no new commit. Re-import against a newer compatible version — confirm it updates, bumps the manifest version, and commits with a "vX → vY" message. Hand-edit previously-placed content, re-import — confirm it's left untouched with a "local edits" notice. Mark a previously-imported skill removed in the registry, run any import — confirm the warning surfaces alongside the primary result without breaking the project.

## Batch 8 — Remove Content from a Project

**Status:** planned

**Contents:** `hatch remove <name>` (UC-4 main flow) plus AF-1 (not imported), AF-2 (manifest/disk drift), AF-3 (local edits present), AF-4 (skill-in-group refusal).

**Rationale:** Depends on Batch 5 and Batch 6 — needs previously-imported standalone skills and group members to remove; AF-4's group-membership refusal specifically needs Batch 6's group tracking.

**Verification:** Remove something imported earlier — confirm files and manifest entry are gone under every harness folder, one commit. Re-run for the same name — confirm the "never imported" no-op. Manually delete a skill's files outside Hatch, run remove — confirm the drift is detected and handled per interactive vs. unattended mode. Hand-edit content, run remove — confirm the local-edit gate. Attempt to remove a single skill that belongs to a group — confirm it's refused with the group named instead.

## Batch 9 — Harness Management

**Status:** planned

**Contents:** `hatch import --add-harness <name>` (UC-3 AF-5) and `hatch remove --harness <name>` (UC-4 AF-5).

**Rationale:** Add-harness backfill depends on Batch 6 (placement, including correctly backfilling groups); drop-harness depends on Batch 8 (removal logic) and Batch 4 (a project's manifest already tracking multiple harnesses). The one batch that genuinely depends on both the Import and Remove lines of work.

**Verification:** Add a harness to a project with existing standalone and group imports — confirm every already-imported item is backfilled into the new harness folder, one commit. Drop a harness — confirm its placed content and manifest entry are gone, one commit. Attempt to drop the project's only remaining harness — confirm it's refused.

## Batch 10 — Prevent Destination-Path Collisions

**Status:** planned

**Contents:** UC-5, implemented per [0014-registry-collision-detection](architecture/decisions/0014-registry-collision-detection.md): the Hatch CLI's resolution/collision logic exposed as an invocable check (subcommand or export); hatch-skills' registry-side CI job (installs the current published `@ai-wise/hatchcli`, never pinned, resolves its own PR'd tree per harness, blocks on a detected collision); hatch-cli's new CLI-side CI job (triggered on harness-registry/resolution changes, fetches the current hatch-skills tree via a new read-scoped credential, blocks a CLI change that would retroactively collide).

**Rationale:** Depends on Batch 4 (harness-suffix resolution logic) and Batch 6 (group/pointer unpacking logic) both being real and working — "resolve everything into a simulated project" only means something once everything it resolves actually exists. Sequenced last as the batch that depends on the most.

**Verification:** On the registry side: add two skill folders whose resolved destination paths collide for some harness, open a PR, confirm the check fails naming both and the shared path and harness; fix one, confirm it passes. On the CLI side: propose adding a new harness code that would retroactively collide with an existing (permanent) registry skill name, confirm the hatch-cli PR is blocked; choose a non-colliding code, confirm it passes. Confirm the CLI-side job's credential is scoped read-only to hatch-skills.
