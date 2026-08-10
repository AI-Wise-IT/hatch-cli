# Registry authentication: token-as-password, env var over home-directory file

## Metadata

- **id:** 0005-auth-token-env-file-precedence
- **component:** auth
- **status:** accepted
- **applies_to:** `hatch login`; every Hatch CLI command that requires an authenticated registry session
- **decision_record:** `docs/architecture/decisions/0005-auth-token-env-file-precedence.md`

## Decision

`hatch login` accepts the registry's GitHub personal access token directly as "the personal password" (no separate password unlocking a stored token) and persists it to `~/.hatch/credentials.json` — a home-directory path, never inside any project's own repo tree — with restrictive file permissions.

Every command requiring registry access resolves the credential with this precedence: check the `HATCH_TOKEN` environment variable first; if unset, read `~/.hatch/credentials.json`. There is no OS keychain integration and no logout/session-invalidation command in this MVP.

## Context

UC-2 (Authenticate to the Registry) fixes the shape of authentication — a single shared personal password, no per-user accounts, no logout in this MVP — but explicitly deferred "how the authenticated session persists and is supplied to subsequent commands" to the architecture step, naming the exact tension this record resolves: "reconciling a local desktop environment (where an env file or local secret store is viable) against an isolated cloud-agent environment (where committing a secret into the target project's git repo is not acceptable)."

[0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and [0004-github-vcs-platform](0004-github-vcs-platform.md) already fixed the underlying credential as a GitHub personal access token, decided in the same architecture conversation as this cluster — folding a second, separate "password" on top of that token would add indirection with no security or usability benefit for a single-developer tool, so the token itself is what `hatch login` takes.

Current practice for CLI credential resolution favors exactly this precedence — explicit environment variable, then a local credentials file, then (optionally) an OS keychain — precisely because headless/CI/cloud-agent contexts have no interactive prompt and often no running keyring daemon. The PRD's own research context confirms cloud-agent sandboxes (Claude Code, Codex) are ephemeral (Firecracker microVMs, sub-second init, torn down when the task completes), so anything Hatch writes to disk inside one is lost with the sandbox — the env var path is not a nicety for the cloud case, it is required for it to work at all.

The developer confirmed directly, while this cluster was being settled, that Claude Code already makes it straightforward to configure a persisted environment variable injected into sandboxed sessions, and expects the equivalent to be similarly simple in Codex (not yet independently verified for Codex specifically).

## Alternatives Considered

- **OS keychain integration (with env var override for headless contexts).** Not chosen: keychain behavior differs by OS, and the ephemeral, often-headless cloud-agent sandboxes this project must support frequently have no keyring daemon running at all — the native bindings this would require are a failure risk for marginal benefit on a personal-use tool.
- **Home-directory credentials file only, no environment variable.** Not chosen: gives cloud-agent sessions no standard, harness-native way to supply the credential into a freshly created sandbox — would push ad hoc file pre-seeding onto whatever orchestrates each session instead of using the injection mechanism harnesses already provide for exactly this purpose.
- **A separate password that unlocks a stored PAT (rather than the PAT itself being the password).** Not chosen: adds a second secret and a decryption step with no offsetting benefit — this is a single-developer, single-credential tool, not a multi-user system where separating "login secret" from "underlying API credential" earns its complexity.
- **OAuth device-code flow / per-user accounts.** Not a genuine option: UC-2's Business Rules and the PRD's Constraints fix this as a single shared personal password, explicitly not a public, multi-user app with account management.

## Trade-offs Accepted

- **Prompt coherence:** high — one precedence rule ("env var, else file") an agent can state and apply without per-OS branching or keychain-availability checks.
- **Failure surface:** the credentials file is plaintext on the user's own machine, the same trust boundary as `~/.ssh` — accepted for a personal-use tool. The cloud-reliable path now depends on an external assumption — that the harness in use (Claude Code, confirmed; Codex, expected but not yet independently verified) provides persistent, session-injected environment variables — which is a real dependency this record does not control.
- **Reversibility:** a keychain backend could be added later as an additional fallback without breaking the precedence contract, since the env var would still be checked first.
- **Operational simplicity:** one code path across desktop and cloud; the setup cost shifts to a one-time, per-harness secret configuration that lives outside Hatch's own scope entirely.

## Consequences

- Hatch CLI's own responsibility ends at the env var/file precedence check. It has no mechanism of its own to persist a secret into a freshly created ephemeral sandbox — that is delegated entirely to the harness's own secret-injection feature (e.g. Claude Code project/global settings, Codex's equivalent).
- The developer must configure `HATCH_TOKEN` as a persisted secret in each harness's own settings, once per harness, as follow-up setup work outside Hatch CLI's own build. If Codex turns out not to offer an equivalent to Claude Code's mechanism, this record's cloud-side assumption needs revisiting.
- `~/.hatch/credentials.json` must never be located inside a project's own repo tree, on any environment.
- No logout command exists in this MVP; rotating the token means overwriting the file (desktop) or updating the harness-level secret (cloud) — there is no in-CLI invalidation path.

## Agent Rules

- MUST check the `HATCH_TOKEN` environment variable first when resolving the registry credential; MUST only read `~/.hatch/credentials.json` if it is unset.
- MUST write `hatch login`'s persisted credential to a home-directory path (`~/.hatch/credentials.json`), MUST NOT write it inside any target project's repo tree.
- MUST NOT implement a logout/session-invalidation command in this MVP.
- MUST NOT introduce OS keychain integration without superseding this record.

## Machine Check

```bash
grep -rn "process.env.HATCH_TOKEN" src/ && grep -rn "hatch/credentials.json" src/
```

Expected result: both patterns are found in the CLI's auth-resolution module, confirming the env-var-first, file-fallback precedence is implemented as one code path. Absence of either indicates the precedence isn't wired up as decided.

## Precedence

- Builds on [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and [0004-github-vcs-platform](0004-github-vcs-platform.md), which fixed the underlying credential as a GitHub personal access token.
- No known conflicting decision records.
