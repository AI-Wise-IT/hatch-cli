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
