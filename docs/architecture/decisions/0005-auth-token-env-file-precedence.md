# Registry authentication: token-as-password, env var over home-directory file

## Metadata

- **id:** 0005-auth-token-env-file-precedence
- **component:** auth
- **status:** accepted
- **applies_to:** `hatch login`; every Hatch CLI command that requires an authenticated registry session
- **decision_record:** `docs/architecture/decisions/0005-auth-token-env-file-precedence.md`

## Decision

`hatch login` accepts the registry's GitHub personal access token directly as "the personal password" (no separate password unlocking a stored token) and persists it to `~/.hatch/credentials.json` — a home-directory path, never inside any project's own repo tree — with restrictive file permissions.

Every command requiring registry access resolves the credential through one shared step (`src/auth/authenticate.ts`), in three tiers:

1. the `HATCH_TOKEN` environment variable;
2. `~/.hatch/credentials.json`, if the variable is unset;
3. an interactive prompt for the token, if neither resolves.

A token supplied at the prompt is validated against GitHub and, on success, persisted to `~/.hatch/credentials.json` exactly as `hatch login` would. `hatch login` is therefore the *explicit* way to seed a credential, not the only one: a first run on a fresh desktop asks once, then behaves like every run after it. A token that fails validation is never persisted, and a failure to reach GitHub at all is reported as the registry being unreachable rather than as a bad credential.

The prompt never echoes the token, and reads stdin in whichever of three modes it finds:

- **A TTY:** raw-mode keystroke reading with terminal echo suppressed, the convention `sudo` and `npm login` use. Ctrl-C resolves as no token rather than force-exiting the process, so the command exits cleanly with a non-zero code instead of racing an in-flight fetch on the way out.
- **A pipe:** the first line of stdin is taken as the token. `echo "$TOKEN" | hatch import <name>` is a supported way for a non-interactive caller that holds a credential to supply it.
- **Neither, with stdin at EOF:** the token resolves empty, reported as "no token provided" with a non-zero exit.

There is no OS keychain integration and no logout/session-invalidation command in this MVP.

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
- **Failure surface:** the credentials file is plaintext on the user's own machine, the same trust boundary as `~/.ssh` — accepted for a personal-use tool. The cloud-reliable path depends on an external assumption — that the harness in use (Claude Code, confirmed; Codex, expected but not yet independently verified) provides persistent, session-injected environment variables — which is a real dependency this record does not control. The "never wait indefinitely" rule holds for a closed stdin, which resolves empty at EOF; a caller whose stdin stays open without ever delivering a line still blocks, because nothing imposes a timeout. Accepted: that is a misconfigured caller rather than a normal one, and the environment variable is the path a correctly-configured non-interactive caller uses.
- **Reversibility:** a keychain backend could be added later as an additional fallback without breaking the precedence contract, since the env var would still be checked first.
- **Operational simplicity:** one code path across desktop and cloud; the setup cost shifts to a one-time, per-harness secret configuration that lives outside Hatch's own scope entirely.

## Consequences

- Hatch CLI's own responsibility ends at resolving a credential from these three tiers. It has no mechanism of its own to persist a secret into a freshly created ephemeral sandbox — that is delegated entirely to the harness's own secret-injection feature (e.g. Claude Code project/global settings, Codex's equivalent).
- The prompt tier is what makes a first desktop run work with no prior setup; it does not soften the cloud story. A cloud-agent sandbox has no interactive terminal, so `HATCH_TOKEN` remains the only reliable path there, and the prompt sits last in the precedence precisely so a correctly-configured automated setup never silently falls into it.
- Every command needing registry access calls the one shared step and wraps the error string it returns in that command's own prefix and suffix — the step returns an unprefixed reason so each command keeps its own reporting conventions. `hatch login` is the deliberate exception: it always prompts, since re-using an already-resolved session would make the command a no-op.
- The developer must configure `HATCH_TOKEN` as a persisted secret in each harness's own settings, once per harness, as follow-up setup work outside Hatch CLI's own build. If Codex turns out not to offer an equivalent to Claude Code's mechanism, this record's cloud-side assumption needs revisiting.
- `~/.hatch/credentials.json` must never be located inside a project's own repo tree, on any environment.
- No logout command exists in this MVP; rotating the token means overwriting the file (desktop) or updating the harness-level secret (cloud) — there is no in-CLI invalidation path.

## Agent Rules

- MUST resolve the registry credential in this order: `HATCH_TOKEN`, then `~/.hatch/credentials.json` if the variable is unset, then an interactive prompt if neither resolves.
- MUST resolve that credential through the one shared `authenticate()` step — MUST NOT reimplement the precedence, the prompt, or the persistence inside a command module. `hatch login`, which always prompts by design, is the one command outside this step.
- MUST validate a prompted token against GitHub before persisting it, and MUST NOT persist one that fails validation.
- MUST report a failure to reach GitHub as the registry being unreachable, never as an invalid credential.
- MUST write a persisted credential to a home-directory path (`~/.hatch/credentials.json`), from any command that persists one; MUST NOT write it inside any target project's repo tree.
- MUST NOT echo a token on any stdin mode.
- MUST exit with "no token provided" and a non-zero code when no token resolves — MUST NOT wait indefinitely for input that is not coming.
- MUST NOT implement a logout/session-invalidation command in this MVP.
- MUST NOT introduce OS keychain integration without superseding this record.

## Invariants

- **The credential-resolution order: `HATCH_TOKEN`, then `~/.hatch/credentials.json`, then an interactive prompt.** Becomes irreversible once: any real developer or CI pipeline has configured `HATCH_TOKEN`, or come to rely on the file fallback — renaming the variable or reordering precedence would silently break existing automated setups rather than failing loudly. The prompt's position last is part of the invariant, not an implementation detail: promoting it above either other tier would turn a configured automated setup into one that blocks for input. Enforcement mechanism: `hatch-cli`'s CI `decision-records` job, which executes this record's Machine Check on every pull request — it confirms all three tiers are present and that no command module outside `src/commands/login.ts` resolves credentials on its own. Their *order* stays unenforced: it is prose an agent obeys, not a fact a command reads. Current mode: blocking.

## Machine Check

- **context:** cli-repo

```bash
grep -q "HATCH_TOKEN" src/auth/credentials.ts || { echo "missing env tier"; exit 1; }
grep -q "credentials.json" src/auth/credentials.ts || { echo "missing file tier"; exit 1; }
grep -q "promptHidden" src/auth/authenticate.ts || { echo "missing prompt tier"; exit 1; }
echo "three tiers present"
callers=$(grep -rln "writeCredentials\|resolveToken" src/ --include=*.ts | grep -v "\.test\.ts" | grep -v "^src/auth/")
[ "$callers" = "src/commands/login.ts" ] || { echo "credential resolution outside the shared step:"; echo "$callers"; exit 1; }
echo "credential resolution confined to the shared step: correct"
```

Expected result: `three tiers present`, then `credential resolution confined to the shared step: correct`, exit 0.

The first three lines assert that all three tiers exist and that the env/file pair lives in one module rather than being scattered. The last pair asserts that exactly one command module — `src/commands/login.ts`, the one sanctioned exception — touches credential resolution outside the shared step. Any other path is a command that has grown its own copy of the precedence: the drift the shared step exists to prevent, and what this record's second Agent Rule forbids.

The check establishes that the three tiers exist and are not duplicated. Their *order* is prose an agent obeys, not a fact this command reads.

## Precedence

- Builds on [0003-registry-github-tarball-fetch](0003-registry-github-tarball-fetch.md) and [0004-github-vcs-platform](0004-github-vcs-platform.md), which fixed the underlying credential as a GitHub personal access token.
- No known conflicting decision records.
