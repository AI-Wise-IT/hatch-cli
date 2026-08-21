# Formal checks: Biome + tsc, enforced in CI and locally via pre-commit hook

## Metadata

- **id:** 0012-biome-formal-checks
- **component:** formal-checks
- **status:** accepted
- **applies_to:** linting, formatting, and type-checking in the Hatch CLI repo; the local pre-commit hook; the CI check job established by [0007-github-actions-deployment](0007-github-actions-deployment.md)
- **decision_record:** `docs/architecture/decisions/0012-biome-formal-checks.md`

## Decision

Biome handles both linting and formatting (single tool, single config) in the Hatch CLI repo. TypeScript's own compiler (`tsc --noEmit`, strict mode) handles type-checking. A local pre-commit hook, via `simple-git-hooks` + `lint-staged`, runs Biome and `tsc` against staged files before each commit, for fast local feedback. The same checks also run in CI as a required status check under [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md), which remains the authoritative enforcement gate — the pre-commit hook is an earlier tripwire, not a substitute for it.

## Context

[0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md) gates every merge on required CI status checks, driven directly by the developer's reasoning that most implementation work will be done by agents and needs a safety net catching violations of tests, formal checks, or established practices. That same reasoning, raised again explicitly when this cluster was settled, extended the gate one step earlier: a local pre-commit hook catching issues before a push even happens, not just before a merge. [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md) fixed TypeScript as the language, which makes `tsc` the type-checker with no genuine alternative — it's the language's own compiler, not a competing choice.

## Alternatives Considered

- **ESLint + typescript-eslint + Prettier + `tsc`.** Not chosen: more moving parts (two tools instead of one, with occasional lint/format rule conflicts even though mitigable via `eslint-config-prettier`), and slower in CI than a single fast binary — which matters more now that every merge waits on this check passing.
- **CI-only enforcement, no local pre-commit hook.** This was the initial default. Not chosen: raised and rejected directly in conversation — the developer explicitly wanted the earlier local tripwire given that most implementation work is agent-driven, not just the CI-time gate already established by 0008.

## Trade-offs Accepted

- **Prompt coherence:** Biome is a newer convention with less training-data coverage than ESLint, offset by its single-config-file model being simple enough to reason about directly.
- **Failure surface:** Biome's plugin ecosystem is smaller than ESLint's; if a specific lint rule is ever needed that Biome doesn't support, migrating back means re-adding the complexity avoided here (Biome ships a migration tool from ESLint/Prettier configs, easing that path if it's ever taken).
- **Reversibility:** high, given that built-in migration tooling.
- **Operational simplicity:** one binary, one config, faster CI feedback; the pre-commit hook adds one more tool but only touches staged files, so it stays fast.

## Consequences

- The Hatch CLI repo needs a `biome.json` config, a `tsconfig.json` with `strict: true`, and `simple-git-hooks` + `lint-staged` configured to run Biome and `tsc` on staged files pre-commit.
- CI's check job (established by [0007-github-actions-deployment](0007-github-actions-deployment.md)) runs the same Biome and `tsc` commands as a required status check under [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- The pre-commit hook is local-only convenience; it does not replace or weaken the CI gate — a commit made with `--no-verify` bypassing the hook is still caught by CI before it can merge.

## Agent Rules

- MUST use Biome for linting and formatting in the Hatch CLI repo.
- MUST use `tsc --noEmit` in strict mode for type-checking.
- MUST configure a pre-commit hook (via `simple-git-hooks` + `lint-staged`) running Biome and `tsc` against staged files.
- MUST NOT treat the pre-commit hook as a substitute for the CI required status check — both must run.
- MUST NOT introduce ESLint or Prettier alongside Biome without superseding this record.

## Invariants

None. Lint/format/type-check tooling is entirely internal — no external dependent observes or relies on which tool enforces code quality. Freely revisable at any time.

## Machine Check

- **context:** cli-repo

```bash
test -f biome.json && grep -q '"strict": true' tsconfig.json
```

Expected result: both checks pass — a Biome config exists and TypeScript strict mode is enabled.

## Precedence

- Builds on [0002-cli-runtime-nodejs](0002-cli-runtime-nodejs.md), [0007-github-actions-deployment](0007-github-actions-deployment.md), and [0008-trunk-based-branch-protection](0008-trunk-based-branch-protection.md).
- No known conflicting decision records.
