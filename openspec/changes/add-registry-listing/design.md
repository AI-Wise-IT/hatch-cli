## Context

See [proposal.md](proposal.md) — Why. The constraints that shape the approach:

- **`src/registry/fetch.ts` has three shapes, none of which lists the registry root.** `registryFolderExists` is a single non-recursive call used as a boolean, `fetchRegistryFile` pulls one file's content, and `fetchRegistryFolder` walks a subtree. A directory call already returns an array of `{name, path, type}` entries — the root listing is that same call with the path `""`, exposed as a real result instead of discarded.
- **The Contents API returns directory entries without file contents.** A directory response carries names and types; a file's base64 content only comes from a call naming that file. So per-entry metadata costs one call each, and there is no batched form of it under the API [ADR-0003](../../../docs/architecture/decisions/0003-registry-github-tarball-fetch.md) settled on.
- **A folder's `skill.json` already answers three of the four things a listing needs.** `version`, `members` (present means group) and `removed` are parsed today by `parseGroupSkillJson`, on a fetch `hatch import` already makes to classify a target. Only the description is new — and only for plain skills, whose descriptions live in a different file.
- **A `404` means two different things at two different paths.** On a named folder it is genuinely ambiguous between "no such name" and "this credential cannot see the registry", which is the ambiguity [backlog-0003](../../../intake/backlog-0003-registry-search-list.md) flagged. On the repository root it is not ambiguous at all: the root exists for anyone who can see the repository.
- **Harness variants cannot be told from ordinary names in isolation.** [ADR-0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md) established this concretely — `_harness-suffix-fixture-cld` beside `_harness-suffix-fixture` is a legitimate variant pair, and a lone `<x>-<code>` is structurally identical to an ordinary skill ending in a reserved code. Any single-snapshot rule has to be sound under that.
- **The registry holds fifteen top-level folders today** — twelve `_`-prefixed fixtures and three real entries. A listing that fetches metadata per entry costs roughly thirty calls at today's size.
- **Scriptable output is a standing No.** `intake/mvp-scope.md` records it as permanent for `hatch import`; nothing about a listing reopens it.

## Goals / Non-Goals

**Goals:**

- Print only names `hatch import` accepts, so the listing can never itself become a source of wrong guesses.
- Reuse the registry access the CLI already has, adding one call shape rather than a second retrieval mechanism.
- Keep the description's source singular per kind — one place to author it, one place to read it, nothing to keep in sync.
- Fail loudly and specifically when the registry is only partly readable, so an incomplete listing is never mistaken for a complete one.

**Non-Goals:**

- Making `hatch list` fast at a registry size the registry does not have. The live walk is chosen knowing its cost grows linearly; the index is the recorded answer if that ever bites.
- Caching anything between runs. Local caching of fetched registry content is a permanent No in `intake/mvp-scope.md`, and this command does not carve an exception.
- Making the testing-content exclusion a security boundary. It hides content from a listing the same way the import gate stops an accident, not a determined reader.

## Decisions

### A live walk, with the index named as the escape hatch rather than built

The root listing is one call. Each surviving entry is one `skill.json` call, plus one `SKILL.md` call when the entry turns out to be a plain skill. At fifteen folders that is under thirty requests; the entries are independent, so they run through a bounded concurrency pool rather than serially.

The alternative — a CI-generated `index.json` at the registry root, fetched in one call — is the faster mechanism and the wrong one to build now. It is a second artifact that must always agree with the tree it describes, which is precisely why [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) rejected a version-to-commit index and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) rejected a removed-names index. Building it also means a CI job and a generator in `hatch-skills` before `hatch list` can do anything at all in `hatch-cli`, for a latency problem that does not exist at this registry's size.

What makes deferring safe is that the index is a drop-in substitute: it would replace the retrieval step behind the same command, the same output and the same spec. Nothing in the requirements names the mechanism, so adopting an index later changes no observable behavior beyond speed.

*Also considered.* The Git Trees API with `recursive=1` returns the whole tree in one call — but still only paths, no contents, so it saves the root call and nothing else while adding a second API surface. GraphQL could batch the blob fetches into one request, which is a real saving, but it is a different API from the one ADR-0003 settled on and a materially larger change than the problem justifies. Both stay available if the index is ever revisited.

### The filter runs before the fetches, not after

Names come from the root listing, so filtering by name is free — it happens on the one call every run makes, before any per-entry metadata is fetched. A filtered `hatch list prd` costs two or three calls where a bare `hatch list` costs thirty.

That ordering also decides where each exclusion sits. The testing-content exclusion keys off the `_` prefix, which is a name, so it filters for free alongside the user's term — the same reason [ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md) put the name check before the fetch in `hatch import`. The removed exclusion needs `skill.json`, so it necessarily applies after that fetch, dropping the entry from the rendered output rather than from the fetch set.

The declaration half of the testing marker — `"testing": true` on a folder without the prefix — is checked on the same `skill.json`, exactly as import checks it, so a folder that reached the registry unprefixed is still excluded.

### Fold a variant only when the plain folder exists

`<base>-<code>` collapses into `<base>` only when `<base>` is itself a top-level folder. That is exactly the case `resolveSkillFolderName` would resolve to the variant, and the only case decidable from one snapshot without guessing.

Everything else is printed literally, and that is not a fallback — it is correct. `hatch import claude-code-guide` resolves: the suffixed candidate `claude-code-guide-<code>` does not exist, so resolution falls through to the folder's own literal name. Printing it is truthful about what you can type.

The cost is a genuinely harness-exclusive family — `handover-cur` with no `handover` — appearing under its suffixed name. That is [ADR-0025](../../../docs/architecture/decisions/0025-harness-shadowing-risk-accepted.md)'s accepted ambiguity showing up on a new surface rather than a new problem, and the alternative is worse: inferring a family from a lone suffixed folder would print `handover`, a name that resolves to nothing.

*Alternative considered.* Listing every top-level folder literally, variants included, and folding nothing. Simpler, and rejected because it prints `handover-cld` next to `handover` as if they were two importable things, which is a wrong-name failure of the same kind this command exists to remove.

### Descriptions: frontmatter for skills, a `skill.json` field for groups

A skill's description already exists, in the `SKILL.md` frontmatter every harness reads. Copying it into `skill.json` would create two authored copies of one sentence with no check that they agree — and the frontmatter is the one that governs how the skill actually behaves once placed, so a drifting `skill.json` copy would misdescribe it in exactly the listing meant to help.

A group has no `SKILL.md`; its folder holds member folders and its own manifest. So a group needs a field of its own, and `skill.json` is where a group's own metadata already lives — `version`, `members`, `removed`, `testing`. `description` joins them as one more additive optional field, the same shape [ADR-0016](../../../docs/architecture/decisions/0016-group-member-manifest-format.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md) each chose over a separate file.

The asymmetry is deliberate and stateable: **a description is read from wherever that kind of content already keeps its own prose.** The alternative — deriving a group's description by joining its members' — was rejected outright: it produces a paragraph per row, and it describes the parts rather than the whole, which is the opposite of what a browsing reader needs.

*Alternative considered.* Requiring `description` on every folder's `skill.json`, skills included, for one uniform read and one fetch fewer per skill. Rejected for the drift above; the extra call buys a guarantee that the printed description is the one the skill actually carries.

### Missing descriptions are listed, missing metadata is an error

An absent description never removes an entry. Every version published before the field was required carries none, and those versions stay reachable forever through pins — the same reasoning that made an absent `testing` field read as ordinary content rather than an error. The entry prints with its description shown as absent.

An unreadable `skill.json`, by contrast, means kind, version and removed-status are all unknown, so the entry cannot be rendered honestly at all. Those are reported by name and the command exits non-zero while still printing everything readable — the shape `check-collisions` already uses for a folder whose `skill.json` will not parse, rather than aborting a whole listing over one bad folder.

### Frontmatter parsed narrowly, without a YAML dependency

The extraction reads the leading `---` fenced block and pulls a single `description` key: a plain scalar on one line, or a folded/quoted value spanning lines until the next key. Anything it cannot make sense of reads as no description.

A real YAML parser would be more correct in general and is not worth a dependency here — the target is one known key in a block authored to a fixed convention, and the failure mode of the narrow reader is a missing description, which the spec already treats as an ordinary listable state rather than an error.

### A root `404` is a credential failure, and only there

`hatch import`'s not-found wording stays exactly as it is — its `404` really is ambiguous, and [ADR-0027](../../../docs/architecture/decisions/0027-testing-skill-convention.md) depends on that wording being identical across a genuine miss and a refusal.

The root listing is a different call. Its path is the repository itself, which exists for anyone who can see the repository, so a `404` there has one reading and `hatch list` says so. This resolves the ambiguity `backlog-0003` raised for this surface without touching import's, and it leaks nothing: a caller who cannot see the registry learns only that their own credential is the problem.

## Risks / Trade-offs

- **The walk's cost grows with the registry** → linear in top-level folders, roughly two calls each, run concurrently. Filtered runs pay only for matches. The index is designed for as a drop-in replacement behind an unchanged spec, so adopting it later is a retrieval swap rather than a redesign.
- **GitHub rate limits on a bare `hatch list`** → a few dozen authenticated requests against a 5,000/hour limit. A run that does hit a limit surfaces as the per-entry read failure path — readable entries printed, unreadable ones named, non-zero exit — rather than as a silently short list.
- **A harness-exclusive family lists under its suffixed name** → accepted, per ADR-0025 and the folding decision above. Printing a resolvable literal name is the honest failure mode; inferring the family would print an unresolvable one.
- **A group's `description` can drift from what the group actually contains** → it is authored prose about a folder whose members change, and no check can verify it stays accurate. The CI check requires it to be present and non-empty, which is the enforceable part; accuracy stays an ordinary content-review matter, exactly as it already is for a skill's frontmatter.
- **The narrow frontmatter reader mis-parses an unusual `SKILL.md`** → degrades to a missing description, which is a listable state. Nothing about the entry's name, kind or version depends on it.
- **`hatch list` is a new way to enumerate the registry** → it shows the same private content the credential already grants access to, so it changes convenience rather than exposure. Testing content is excluded from an ordinary project's view, and the output never reveals that anything was withheld.

## Migration Plan

`hatch list` is a new command; nothing depends on it and no existing behavior changes, so there is no rollback beyond not shipping it.

The cross-repo work has one ordering constraint. `description` must be added to every group's `skill.json` in `hatch-skills` **before** the CI check requiring it becomes blocking, or the check fails on the registry's own content — the same two-step order the testing-skill change used for its mandatory `testing` field. The CLI tolerates a missing description at every stage, so `hatch list` is correct and useful before either registry step lands, and gets better as they do.

`hatch-usage/SKILL.md` is updated last: it should not point agents at `hatch list` until a released CLI actually has it.
