> **Unfinished proposal.** Captured so the idea is not lost and a later scoping pass starts from a real record. Explicitly far out of scope — recorded because it came up while scoping [`add-registry-listing`](../add-registry-listing/proposal.md), not because it is close to being built. Not scoped, not designed, not scheduled, and it conflicts with several standing decisions (see Open Questions). Nothing here is decided.

## Why

`hatch list [filter]` matches a substring against names. That solves the failure that prompted it — a half-remembered `prd-elicit` finding `prd-elicitation` — and only that one. It cannot answer a question asked in the wrong vocabulary.

"Which skill helps me write requirements?" finds nothing, because the skill is called `prd-elicitation` and the word *requirements* appears in its description, not its name. Substring matching over descriptions would not fix this either: the useful query is rarely a literal substring of the answer. The gap is between how someone describes what they want and how the content that does it happens to be named.

This matters most for exactly the caller that prompted [`add-registry-listing`](../add-registry-listing/proposal.md): an agent working from a task description, with a rich statement of intent and no knowledge of the registry's vocabulary — the case where meaning-based matching helps most and name matching helps least.

## What Changes

Sketch only, and deliberately thin — this is a direction, not a design.

- Matching a natural-language query against skill and group descriptions by meaning rather than by literal substring.
- Descriptions as the corpus, since [`add-registry-listing`](../add-registry-listing/proposal.md) establishes that every skill and group carries one.

## Capabilities

Provisional and probably premature. A capability worth specifying does not exist until the mechanism below is chosen, since the mechanism determines what the behavior can even be.

### New Capabilities

- None assumed.

### Modified Capabilities

- None assumed.

## Open Questions

Every one of these is unanswered, and the first three would each, on their own, decide whether this is buildable in anything like its current framing.

- **Where the embeddings live.** They have to be computed and stored somewhere. A registry-side index computed in CI is the obvious answer and runs straight into [`add-registry-listing`](../add-registry-listing/design.md)'s reasoning for not building one — plus [ADR-0009](../../../docs/architecture/decisions/0009-skill-versioning-semver-tags.md) and [ADR-0019](../../../docs/architecture/decisions/0019-registry-removed-metadata-flag.md), which both rejected a second artifact that must agree with the tree. Storing them locally runs into `intake/product-requirements.md`'s permanent No on caching fetched registry content.
- **What computes the query embedding.** A hosted service means the CLI gains a network dependency beyond GitHub and an API key beyond the registry credential. A local model means a package distributed via `npx` gains a model download. Neither fits what this CLI currently is.
- **Whether this belongs in the CLI at all.** A search surface with an index behind it may be a different product from a CLI that fetches folders from a private repo. Worth asking before assuming it is a command.
- **Whether descriptions are enough signal.** One sentence per entry is a thin corpus. Embedding the full `SKILL.md` body would be richer and much more to fetch, store and keep current.
- **How results are ranked and cut off.** Semantic search always returns something. A query with no good answer returning three confident-looking wrong ones is worse than the current behavior, which returns nothing and says so.
- **Privacy.** The registry is private. Sending descriptions — or a query about them — to a third-party embedding service moves private content off GitHub, which is a decision about the registry's confidentiality, not a technical detail.
- **Whether the cheaper version is enough.** Matching the filter against descriptions as well as names is a small change to an existing command and would catch a fair share of these queries. Worth trying before anything here, and worth deciding as part of a later `add-registry-listing` follow-up rather than under this record.
