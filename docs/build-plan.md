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
