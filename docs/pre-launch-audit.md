# Pre-Launch Audit

**Run date:** 2026-08-12
**Scope:** All 22 architecture decision records in `docs/architecture/decisions/`, cross-checked against the real state of both repos this project spans — `hatch-cli` (this checkout) and `hatch-skills` (sibling checkout at `../hatch-skills`, confirmed present locally).

This is a current-state snapshot, not an accumulating log. It overwrites the previous run's content (there was no previous run — this is the first).

## Headline result

**No urgent drift found.** One invariant *did* drift into accidental blocking enforcement earlier in the build (see below) — but it was already caught and downgraded to advisory the same day this audit ran (`hatch-skills` PR #15), before any real external dependent existed. That's the exact failure mode this audit exists to catch, and in this case the project caught it on its own. Nothing found in this run is new.

**No purge candidates found.** Every artifact whose name would become permanent once the relevant invariant goes blocking is currently cited as real, still-relevant verification evidence in `docs/build-plan.md`. Nothing is safe to flag for removal right now — not because cleanup wasn't considered, but because there is genuinely nothing unreferenced yet.

---

## 1. Invariants already blocking with no recorded cutover — urgent drift

**None currently.** See "Resolved drift" below for a case that applied earlier and has since been corrected.

## 2. Invariants correctly advisory — on track, awaiting a deliberate cutover

| Invariant | Source ADR | Enforcement mechanism | Verified state |
|---|---|---|---|
| Top-level registry folder name is permanent — never deleted or renamed | [0013](../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) | `hatch-skills` CI `name-permanence-check` (required status check) | **Advisory, confirmed live.** `.github/workflows/ci.yml` sets `NAME_PERMANENCE_ENFORCEMENT: warn`; `scripts/check-name-permanence.mjs` exits `0` and emits `::warning::` on a missing name rather than failing the job when that env var is anything other than `"block"`. Branch protection on `hatch-skills/main` does list `name-permanence-check` as a required context, but a required check that always exits 0 in warn mode cannot block a merge — matches the ADR's documented mode exactly. |
| "Removed" is a metadata flag, never a folder deletion | [0013](../docs/architecture/decisions/0013-registry-group-structure-and-permanence.md) | Same `name-permanence-check` job (a `removed: true` folder that got deleted instead of flagged would itself be caught by the same missing-name check) | Advisory, same verified state as above — this is the release valve for the rule above, not an independently-enforced rule. |

### Resolved drift (informational — already fixed, not a current finding)

ADR-0013's own Invariants section documents that `name-permanence-check` was **accidentally blocking from Batch 2** (when it was first added, before the pre-launch framework existed to catch this class of problem) **until `hatch-skills` PR #15**, which downgraded it to warn-only "on discovery." Git history in `hatch-skills` confirms the sequence directly:

```
f304b1c chore: make name-permanence check warn-only for pre-launch (#15)
2f3cfbe chore: add name-permanence CI check (ADR-0013)
f85087a chore: infrastructure skeleton (README, version-bump-check + tag-push CI)
```

This is exactly the trap `references/invariant-framework.md` describes: a check built and tested against real activity quietly started protecting content before anyone had named a launch. It's flagged here for visibility, not as an open item — the fix already landed, the check is verifiably in warn mode today, and no cutover has been declared, so the current state is correct.

## 3. Invariants with no enforcement built yet — build gaps, not urgent

These are documented as `not-yet-built` in their ADR and verified to have no corresponding mechanism in either repo today. None of these block anything from being cleaned up right now; they're listed so a future audit has a baseline to compare against as the build progresses.

| Invariant | Source ADR | Notes |
|---|---|---|
| Harness-code reserved set only grows, never reused | [0001](../docs/architecture/decisions/0001-harness-suffix-convention.md) | No dedicated check; 0014's collision check (also not built) will assume this rather than verify it. |
| Harness targeting is folder-name-only, never metadata/frontmatter | [0001](../docs/architecture/decisions/0001-harness-suffix-convention.md) | Unenforced convention in `hatch import`'s implementation. |
| Per-project manifest lives at `hatch.manifest.json` | [0003](../docs/architecture/decisions/0003-registry-github-tarball-fetch.md) | No check verifies the filename/location hasn't drifted. |
| `HATCH_TOKEN` env var checked before `~/.hatch/credentials.json` | [0005](../docs/architecture/decisions/0005-auth-token-env-file-precedence.md) | Implemented in `src/auth/credentials.ts` and covered by ordinary unit tests, but nothing asserts the precedence itself stays stable release-over-release. |
| Package name must stay `@ai-wise/hatchcli` | [0006](../docs/architecture/decisions/0006-npm-public-distribution.md) | Verified: `.github/workflows/ci.yml` (hatch-cli) runs lint/typecheck/test/build only — no step inspects `package.json`'s `name` field. The ADR's own Machine Check is a manual grep, not wired into CI. npm's own registry immutability is the only real backstop today. |
| Manifest migration chain must never drop an already-shipped migration key | [0010](../docs/architecture/decisions/0010-manifest-schema-migrations.md) | Pure code discipline; no regression test asserts the full historical chain stays registered. |
| `members` array `{kind, name, version?}` shape on a group's `skill.json` | [0016](../docs/architecture/decisions/0016-group-member-manifest-format.md) | No `schemaVersion` on registry-content `skill.json` files at all — unlike the project manifest, there's no migration chain equivalent if this shape ever needs to change. |
| `contentHash` computation algorithm (SHA-256, sorted path/content pairs, primary-harness-only) | [0018](../docs/architecture/decisions/0018-manifest-content-hash-local-edit-detection.md) | No version tag on the algorithm itself — a future change would have no way to distinguish an old-algorithm hash from a new one on an existing entry. |
| `removed` field shape: plain boolean only, never an enum/index | [0019](../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) | Covered only by ordinary registry-content review. |
| `pin: {type, value}` shape + `<name>@<spec>` parsing rules | [0020](../docs/architecture/decisions/0020-standalone-version-pin-manifest-and-parsing.md) | Manifest-field half is covered by 0010's general migration-chain rule; the CLI argument-parsing convention itself has no dedicated enforcement. |
| Block (`exit 1`) a first-time import of a removed target | [0021](../docs/architecture/decisions/0021-block-first-time-import-of-removed-target.md) | Current behavior is covered by automated tests; nothing asserts the exit-code contract stays stable release-over-release. Flagged by its own ADR for completeness, not urgency — no real automation depends on it yet. |
| `--force-all` / `--force-clean` flag names and mutually-exclusive semantics | [0022](../docs/architecture/decisions/0022-remove-force-flags-not-prompt.md) | Same shape as above — tested today, but no stability guarantee across releases. |
| **CLI-side retroactive-collision block** | [0014](../docs/architecture/decisions/0014-registry-collision-detection.md) | Verified: Batch 10 (`docs/build-plan.md`) is still `planned`, not built. Neither repo's CI has a collision-check job today — `hatch-cli`'s required status checks are `["checks"]` only, `hatch-skills`' are `["version-check", "name-permanence-check"]`. Matches the ADR exactly. |

## 4. Invariants already correctly blocking

For completeness — these are working as intended and need no action:

| Invariant | Source ADR | Verified state |
|---|---|---|
| Any changed skill/group folder must also bump `skill.json`'s `version` | [0009](../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) | `version-check` is a required status check on `hatch-skills/main` (confirmed via `gh api .../branches/main/protection`); `scripts/check-version-bump.mjs`'s `check` mode unconditionally `exit(1)`s on an offender — no warn mode exists for this script at all. Correctly blocking since early in the build, as the ADR states, since it protects registry integrity itself rather than a pre-launch cleanup window. |
| `<name>@<version>` git tag pushed automatically on every version change | [0009](../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) | `tag-versions` job confirmed present and wired to the same script's `tag` mode. "Blocking in effect" only by convention — nothing in either repo's workflows currently force-deletes or moves a tag, matching the ADR's own caveat that this isn't code-enforced, just unused. |

Not invariant-tagged as "irreversibility" concerns, but worth noting as independently verified during this audit since they're binding from day one regardless of launch state (per ADR-0004's own framing, these were explicitly excluded from the "safe to relax pre-launch" category):
- `hatch-skills` is private on GitHub (`gh api repos/AI-Wise-IT/hatch-skills --jq .private` → `true`). Confirmed correct.
- `hatch-cli` is public on GitHub (`gh api repos/AI-Wise-IT/hatch-cli --jq .private` → `false`). Confirmed correct, matches ADR-0004's post-acceptance correction.

## 5. Artifact classification

The only invariant in this project whose trigger condition threatens to make specific *named artifacts* permanent is ADR-0013's name-permanence rule, scoped to every top-level folder in `hatch-skills` that carries a `skill.json`. That rule is currently advisory (see §2), so nothing is locked in yet — this is exactly the purge window the framework describes, and it's still open.

Every top-level folder present in `../hatch-skills` today, classified:

| Folder | Category | Reasoning |
|---|---|---|
| `hatch-usage` | **Keep** | Real, non-fixture skill; placed by every `hatch new` invocation (Batch 4 verification). |
| `prd-elicitation` | **Keep** | Real, non-fixture skill; used in Batch 5/6 verification and by this project's own `.claude/skills/`. |
| `architecture-decisions` (+ nested `design-architecture-decision`, `write-architecture-decision`) | **Keep** | Real group; this project's own working skills, published as a nested-member group and cited as Batch 6's main-flow verification fixture. |
| `_group-fixture-combo` | **Keep** | Cited by name in Batch 6 verification (pointer-to-skill + pointer-to-group recursion test). |
| `_group-fixture-sub` | **Keep** | Cited by name in Batch 6 verification, as `_group-fixture-combo`'s nested pointer target. |
| `_group-fixture-conflict-same-major` | **Keep** | Cited by name in Batch 6 verification (AF-9 same-MAJOR conflict test). |
| `_group-fixture-conflict-cross-major` | **Keep** | Cited by name in Batch 6 verification (AF-9 cross-MAJOR abort test). |
| `_group-fixture-versioned` | **Keep** | Cited by name in Batch 6 verification (pinned-pointer target) and again in Batch 7 (pin-clearing `@latest` test against its `v1.0.0`/`v2.0.0` tags). |
| `_harness-suffix-fixture` / `_harness-suffix-fixture-cld` | **Keep** | Cited by name in Batch 5 verification (harness-suffix resolution) and Batch 7 (AF-12 range-pin test). |
| `_reimport-fixture` | **Keep** | Cited by name in Batch 7 verification (AF-1/AF-2/AF-3, using real `v1.0.0`/`v1.1.0` tags). |
| `_removed-fixture` | **Keep** | Cited by name in Batch 7 verification (AF-4 warning, AF-13 first-time-import block). |
| `_registry-integrity-fixture` | **Keep — deliberately permanent by design.** | Added specifically to prove the (then newly-added) name-permanence check blocks a deletion; its own `NOTE.md` states it can never be removed through a normal PR. This one isn't just referenced — its entire purpose is to stay forever, independent of this audit. |

**No purge candidates. No ambiguous cases.** I checked every top-level folder in the registry checkout against every batch's verification section in `docs/build-plan.md` (27 total name-occurrences found across the 12 folders, via a full-file grep) — each one is still cited as live evidence for a specific, still-relevant verification claim. Nothing is orphaned.

## Completion checklist

- [x] Every invariant found across all 22 ADRs was checked, not sampled.
- [x] Each invariant's real enforcement state was verified by inspecting the actual mechanism (CI workflow YAML, the enforcement scripts themselves, live `gh api` branch-protection queries, `git log` on the enforcement scripts) — not inferred from its documented mode.
- [x] The one invariant found to have drifted into blocking without a recorded cutover was identified and flagged as resolved, with the exact commit that fixed it.
- [x] Every artifact whose permanence is at stake was classified with its reasoning and where I looked (`docs/build-plan.md`'s verification sections, via full-file grep for each name).
- [x] Report written to `docs/pre-launch-audit.md`; findings also surfaced directly in this response.
- [x] Nothing was modified, deleted, or reconfigured during this run — this was a read-only audit.
