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

**Status:** done

**Contents:** `hatch login` (UC-2): main flow (prompt for the registry's GitHub PAT, validate, persist per [0005-auth-token-env-file-precedence](architecture/decisions/0005-auth-token-env-file-precedence.md)) and AF-1 (invalid password). Token validation calls GitHub's `GET /user` — the lightest authenticated call available, proving the token is a live GitHub credential without requiring any scope or reaching the private skill-content repo itself (that repo-specific reachability check belongs to later batches' fetch logic, not login). The env-var-first, file-fallback credential resolution (`resolveToken()`) is exposed as a standalone, importable module (`src/auth/credentials.ts`) rather than buried in the login command, so later batches (bootstrap, import) can reuse it directly.

**Rationale:** Nothing else in the CLI can be demoed without it — the PRD's own sequencing notes state login must ship before or alongside private-skill support. No dependency on any other remaining batch.

**Verification:** All of the following were directly observed, not inferred from code:
- AF-1 (invalid token): ran the built CLI with a garbage token — rejected with `hatch login: invalid password (GitHub rejected the token as invalid or expired) — nothing was changed.`, exit code `1`, and confirmed `~/.hatch/credentials.json` was not created.
- Main flow (valid token): the developer ran `hatch login` with a real, short-lived GitHub personal access token (revoked immediately after testing) — confirmed the success message printed, exit code `0`, and `~/.hatch/credentials.json` created with the expected `{ token }` shape.
- `HATCH_TOKEN` precedence: with the file already populated from the step above, the developer set `HATCH_TOKEN` to a different value and confirmed `resolveToken()` returned the env var's value rather than the file's. This didn't need a second real GitHub token, since `resolveToken()` resolves the precedence without re-validating against GitHub — that validation only happens inside `hatch login` itself.
- Backing automated coverage: unit tests for credential precedence, file persistence with restrictive permissions (skipped on Windows, where POSIX file-mode bits don't apply), and GitHub token validation via `msw`-mocked responses (200 / 401 / network-failure).

**Notes — implementation detail discovered during this batch:**
- Hit and fixed a native crash on Windows while wiring this up: calling `process.exit()` directly while an in-flight `fetch`/undici handle was still finalizing tripped a libuv assertion (`UV_HANDLE_CLOSING`, `src/win/async.c`). Fixed by using `process.exitCode` assignments instead of `process.exit()`, letting Node exit naturally once pending work settles — applies to the CLI entrypoint and the login prompt's Ctrl-C handling.

## Batch 4 — Bootstrap a New Project

**Status:** done

**Contents:** `hatch new` (UC-1): main flow and all 5 AFs (invalid password, target path occupied, invalid harness selection, target location not writable, registry unreachable). Stands up `src/harness-registry.json` + `src/harness-registry.ts` ([0001-harness-suffix-convention](architecture/decisions/0001-harness-suffix-convention.md)) — the canonical harness-code registry (`claude`/`cld`, `codex`/`cdx`, `cursor`/`csr`, each with its own `skillsDir`) and the prefer-suffixed/fall-back-to-plain resolution logic every later import/harness-management batch reuses. Stands up `src/registry/fetch.ts` ([0003-registry-github-tarball-fetch](architecture/decisions/0003-registry-github-tarball-fetch.md)) — a recursive GitHub contents-API fetch adapter for a named registry subdirectory (no clone, no local cache), distinguishing not-found from unreachable. Adds the fixed, harness-neutral `hatch-usage/` self-doc skill to the `hatch-skills` registry (no such content existed there yet). The whole operation — auth, folder create, git init, skill fetch/place, manifest write (schema v1, via the existing `migrateManifest()`), and commit — rolls back the target folder entirely on any failure after creation starts, so every AF and any partial failure leaves nothing behind.

**Rationale:** Depends on Batch 3 (login). Establishes the manifest, git-init/commit, and single-skill fetch/place/harness-resolution mechanism that Import extends next — the narrow-then-broad build order.

**Verification:** All of the following were directly observed, not inferred from code:
- Main flow (real, valid registry PAT): ran the built CLI end-to-end (`node dist/index.js new hatch-new-verify --harness claude,codex`) — exit `0`; `hatch-new-verify/hatch.manifest.json` contained `{ schemaVersion: 1, harnesses: ["claude", "codex"], skills: { "hatch-usage": { version: "1.0.0" } } }`; `SKILL.md` present under both `.claude/skills/hatch-usage/` and `.codex/skills/hatch-usage/`; `git log` showed exactly one commit; working tree clean (nothing left uncommitted).
- AF-1 (invalid password): ran against the real GitHub API with a garbage token — rejected with `hatch new: invalid password (GitHub rejected the token as invalid or expired) — nothing was created.`, exit `1`, no folder created, no credentials file written.
- AF-2 (target path occupied): pre-created the target folder, re-ran — rejected with `... already exists — nothing was created.`, exit `1`, existing folder left untouched (no `.git` added to it).
- AF-3 (invalid harness selection): ran with one real and one bogus harness name — rejected naming the bogus one specifically, exit `1`, before authentication was even attempted (confirmed `resolveToken()` never called) and before anything was created.
- AF-4 (target location not writable): ran against a non-existent nested parent path — rejected with `... does not exist — nothing was created.`, exit `1`.
- AF-5 (registry unreachable), both trigger points: temporarily pointed the auth-validation call and, separately, the registry-fetch call at a genuinely unresolvable host, confirmed each aborts with `... registry unreachable (...) — nothing was created.`, exit `1`, nothing created in either case — then reverted both temporary edits and rebuilt clean before any commit.
- Rollback on partial failure: automated test forces a failure after the target folder is created (mocked `simple-git` init throwing) and confirms the folder is removed entirely — no manifest, no partial content.
- Backing automated coverage: unit tests for harness-registry resolution (suffix-preferred/fallback/unavailable), the registry fetch adapter (`msw`-mocked GitHub contents API — flat folder, nested subdirectories, not-found, network failure, unexpected status), and `hatch new`'s main flow, all 5 AFs, and the rollback path (real filesystem + real git in a temp dir, network and auth mocked).

**Notes — implementation details discovered during this batch:**
- The registry credential needs more than Batch 3's login step ever required: `GET /user` (login's validation call) needs no scope, but GitHub's contents API returns a private repo as `404` (not `403`) to a token without real read access to it — so a token that passes `hatch login` cleanly can still fail `hatch new`'s registry fetch with what looks like a "not found" error. Surfaced this to the developer directly rather than guessing; resolved by widening the existing stored token's scope (classic PAT → added the `repo` scope) without needing to regenerate or re-login. Worth a future correction to [0005-auth-token-env-file-precedence](architecture/decisions/0005-auth-token-env-file-precedence.md) or its onboarding notes, to state the `repo` scope requirement explicitly rather than leaving it implicit in ADR-0003's fetch mechanism.
- The specific harness codes (`cld`, `cdx`, `csr`) and each harness's `skillsDir` convention were not fixed by ADR-0001 beyond a `cdx` example for Codex — ADR-0001 explicitly delegates the current membership of that set to this batch's registry file rather than fixing it itself, so these were decided here as an implementation detail of standing up `src/harness-registry.json`, not flagged as a separate architecture decision.

## Batch 5 — Import: first-time, standalone skill

**Status:** done

**Contents:** `hatch import <name>` (UC-3 main flow, for a single named skill) plus AF-6 (destination occupied), AF-7 (registry unreachable), AF-8 (invalid password). Adds `registryFolderExists` (`src/registry/fetch.ts`) — a single, non-recursive contents-API check used as `resolveSkillFolderName`'s `folderExists` callback — giving Batch 4's harness-suffix resolution logic its first real exercise (`hatch new`'s harness-neutral self-doc skill never needed it). Adds `promptLine` (`src/cli/prompt.ts`) for AF-6's interactive skip/suffix choice. Auto-inits git for an existing, non-git target project (UC-3 step 2), not rolled back on a later failure since it's idempotent one-time setup rather than part of UC-3's "nothing changed" postcondition scope.

**Rationale:** Depends on Batch 4 (login) and reuses/extends bootstrap's fetch/place/manifest/commit machinery to an arbitrary named skill. Deliberately scoped to standalone skills only — group/pointer handling is substantial enough (per [0013-registry-group-structure-and-permanence](architecture/decisions/0013-registry-group-structure-and-permanence.md)) to be its own batch next.

**Verification:** All of the following were directly observed, not inferred from code:
- Main flow (real, valid registry PAT with `repo` scope): ran `node dist/index.js import hatch-usage --harness claude,codex` against a fresh non-git folder — exit `0`; git auto-initialized; `SKILL.md` placed under both `.claude/skills/hatch-usage/` and `.codex/skills/hatch-usage/`; `hatch.manifest.json` contained `{ schemaVersion: 1, harnesses: ["claude", "codex"], skills: { "hatch-usage": { version: "1.0.0" } } }`; exactly one commit; working tree clean; printed summary.
- Harness-suffix resolution actually exercised for the first time: imported the new `prd-elicitation` skill (real, harness-neutral, packaged from this repo's own `.claude/skills/prd-elicitation/SKILL.md`) and a purpose-built `_harness-suffix-fixture`/`_harness-suffix-fixture-cld` dummy pair (added to `hatch-skills` for this) — `hatch import _harness-suffix-fixture --harness claude` placed the `-cld` variant's content, deployed under the plain name, confirming the suffix-preferred-over-plain resolution path (0001-harness-suffix-convention.md) works, which Batch 4 never exercised since `hatch-usage` has no suffixed sibling.
- AF-6 (destination occupied), unattended: pre-occupied a destination path with non-Hatch content, re-ran import — exit `0`, pre-existing file left untouched, skip reported in the printed summary, manifest still written, one commit still made. Interactive skip/suffix choice covered by automated tests (`src/commands/import.test.ts`) rather than a real terminal, since driving a genuine interactive TTY isn't practical in this environment.
- AF-7 (registry unreachable), both trigger points: temporarily pointed the fetch URL (`src/registry/fetch.ts`) and, separately, the auth-validation URL (`src/auth/github-token.ts`) at `api.github.verify-unreachable-xyz.invalid`, rebuilt, confirmed each aborts with `registry unreachable (...)`, exit `1`, nothing created beyond the (expected, not-rolled-back) git init — then reverted both edits exactly (`git diff` confirmed clean) and rebuilt before committing anything.
- AF-8 (invalid password): ran against the real GitHub API with a garbage token — rejected with `hatch import: invalid password (GitHub rejected the token as invalid or expired) — nothing was changed.`, exit `1`, no manifest written, no credentials written.
- Backing automated coverage: `src/commands/import.test.ts` (main flow, manifest bootstrap requiring `--harness` on a manifest-less project, harness-suffix preference, AF-6 unattended and interactive skip/suffix, AF-7 all three trigger points, AF-8, and rollback on a mid-operation failure that leaves the target project directory itself intact) plus `src/registry/fetch.test.ts` additions for `registryFolderExists`.

**Notes — architecture gap discovered and resolved during this batch:**
- UC-3 states `hatch import` "works against any existing project, not only ones originally created by `hatch new`," but its own business rules also state harness placement is governed by the manifest, never filesystem scanning — and neither UC-3 nor [0001-harness-suffix-convention](architecture/decisions/0001-harness-suffix-convention.md) (whose own Consequences section had explicitly left this open) specified how a project with no manifest yet supplies its initial harness selection. Surfaced to the developer directly rather than guessing; resolved as [0015-import-harness-selection-flag](architecture/decisions/0015-import-harness-selection-flag.md): an explicit `--harness` flag on `hatch import`, mirroring `hatch new`'s, required only for a project's first import.

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
