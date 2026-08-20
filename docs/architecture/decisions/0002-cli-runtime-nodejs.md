# Hatch CLI runtime: TypeScript on Node.js, npm-distributed

## Metadata

- **id:** 0002-cli-runtime-nodejs
- **component:** cli-runtime
- **status:** accepted
- **applies_to:** the Hatch CLI repository — its implementation language, build tooling, package manifest, and git-plumbing approach
- **decision_record:** `docs/architecture/decisions/0002-cli-runtime-nodejs.md`

## Decision

The Hatch CLI is implemented in TypeScript, running on Node.js, and distributed as an npm package (installable via `npm install -g` and invocable via `npx`).

Git operations the CLI performs against target-project repositories (detecting whether the project is a repository root, staging, and committing) are implemented by shelling out to the system `git` binary through a thin wrapper (e.g. `simple-git`) — never a native git binding (e.g. nodegit) and never a pure-JS git reimplementation (e.g. isomorphic-git). *Which* operations the CLI performs, and when, is decided in [0026-git-optional-dependency](0026-git-optional-dependency.md); this record decides only how they are executed.

## Context

The PRD's Purpose section names making Hatch usable "from anywhere — including the cloud sessions already in use today and phone-initiated work soon to come" as a primary forcing function, replacing the old hardcoded local-checkout dependency. Cloud coding-agent sandboxes (Claude Code, Codex) run as network-egress-restricted environments that allow-list package registries (npm, PyPI) by default but do not reliably allow arbitrary outbound fetches such as a compiled-binary release download. Node.js and npm are very likely already present and allow-listed in these sandboxes; a Go/Rust binary fetched via a GitHub-releases download is not guaranteed to be.

`hatch init`, `hatch import`, and `hatch remove` (UC-3, UC-4) perform real git plumbing against arbitrary target projects: detecting whether the project directory is a repository root, and recording each operation's whole effect as exactly one commit when it is. Every one of today's dev sandboxes (local and cloud-agent) already has a system `git` binary present, making shell-out the lowest-risk path.

The PRD's Constraints state: "If this system sits untouched for six months, it's expected to keep working; the main foreseeable risk is credential expiry" — favoring a runtime with no separate build/release pipeline to keep alive.

This decision was confirmed in the architecture conversation alongside 0003 (registry fetch model) and 0004 (VCS platform) as one interdependent cluster.

## Alternatives Considered

- **Go, distributed as a static binary via GitHub Releases.** Not chosen: the binary-download installation step may be blocked by the same sandbox egress restrictions this project exists to work around — the risk lands precisely in the cloud-agent context the PRD names as its forcing function.
- **Rust, same distribution story as Go.** Not chosen: adds compile-time and learning-curve cost with no offsetting benefit — Hatch is a low-throughput, I/O-bound tool (file placement and git commits), not a workload where Rust's performance advantage matters.
- **Bun or Deno as the primary runtime.** Not chosen: less certain than Node.js to be preinstalled and allow-listed across every current and future cloud-agent sandbox; Node is the safer universal default for this project's cross-environment requirement.

## Trade-offs Accepted

- **Prompt coherence:** high — `npx @ai-wise/hatchcli` is a familiar idiom already used by countless dev tools, and a coding agent is already fluent with npm-ecosystem conventions.
- **Failure surface:** committing depends on a system `git` binary and the `simple-git` wrapper being present; accepted because every dev sandbox in scope (local or cloud-agent) already has git installed, and because a project without usable git is handled rather than failed ([0026-git-optional-dependency](0026-git-optional-dependency.md)).
- **Reversibility:** high — a TypeScript CLI is not deeply architecturally locked in; rewriting in another language later is a well-trodden path if the constraint set changes.
- **Operational simplicity:** `npm install -g` / `npx` requires zero provisioning locally or in an ephemeral cloud sandbox, at the cost of giving up the "single static binary, zero runtime dependency" property Go/Rust would offer — judged not worth the sandbox-egress risk it would introduce.

## Consequences

- The Hatch CLI repo will contain a `package.json` and be published to a package registry; the exact registry (public npm vs. scoped/private) is settled separately in the CLI packaging & distribution cluster, not here.
- Installation documentation must state a system `git` installation as a recommendation, not a hard prerequisite: without it a project is treated as not version-controlled and every command still completes its work, warning that nothing will be committed ([0026-git-optional-dependency](0026-git-optional-dependency.md)).
- This decision resolves the TODO left open in [0001-harness-suffix-convention](0001-harness-suffix-convention.md) ("`<!-- TODO: decide once the CLI's own language and repo layout are settled -->`" for the canonical harness-registry file's location): the harness registry lives at `src/harness-registry.json` in the Hatch CLI repo. 0001 has been updated to point here.

## Agent Rules

- MUST implement the Hatch CLI in TypeScript targeting Node.js.
- MUST perform git operations against target-project repos by shelling out to the system `git` binary (e.g. via `simple-git`), never a native binding or a pure-JS git reimplementation.
- MUST NOT introduce a compiled-binary distribution path (Go, Rust, or similar) for the primary CLI without superseding this record.

## Invariants

None. This record's choices (TypeScript/Node runtime, shelling out to system `git`) remain freely revisable without breaking any existing external dependent — a real user only ever interacts with the CLI's published interface ([0006-npm-public-distribution](0006-npm-public-distribution.md)), never its implementation runtime. Switching runtimes later would be a real engineering effort but wouldn't invalidate anything an external dependent already relies on.

## Machine Check

```bash
test -f package.json && grep -q '"typescript"' package.json && ! test -f go.mod && ! test -f Cargo.toml
```

Expected result: exits 0 — `package.json` exists and declares a `typescript` dependency, and no `go.mod` or `Cargo.toml` exists at the repo root.

## Precedence

- Resolves an open TODO in [0001-harness-suffix-convention](0001-harness-suffix-convention.md) — that record has been updated to reference this one for the harness-registry file's location.
- Decides only *how* git operations are executed. *Which* operations the CLI performs, and when, is decided in [0026-git-optional-dependency](0026-git-optional-dependency.md); on any question of git behavior, that record governs.
- No known conflicting decision records.
