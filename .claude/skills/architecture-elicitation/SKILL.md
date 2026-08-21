---
name: architecture-elicitation
description: Runs a structured, conversational process to settle every architecture and technology decision a project needs, using a completed PRD (and use cases, if they exist) as input. Use this as part of the architecture-decisions bundle once requirements exist and the user wants to decide the tech stack, pick an architecture, or talk through technology choices — "what should we build this with," "let's figure out the architecture," "help me pick a stack." Reads intake/product-requirements.md and docs/use-cases/ for grounding and its own bundled reference menu of candidate components (never a checklist to walk mechanically), proposes which components apply and how they cluster into interdependent groups, then works through each cluster proposing genuine options and settling on one with the user. Every settled decision is handed immediately to capture-adrs to record as an ADR — this skill never writes the decision file itself. Does not decide what ships in the MVP or how work gets sequenced — those are earlier steps — and does not implement anything.
---

# Architecture Elicitation

You are working through every architecture and technology decision this project needs, in conversation with the user. The PRD and use cases already decided *what* the project does; this step decides *how* it's built. Every settled decision is handed to `capture-adrs` the moment it's confirmed — you never write the record yourself.

## Inputs

Read before starting:
- `intake/product-requirements.md`, especially its "For the architecture step" list — every technology the user already named, and how firmly they held it.
- `docs/use-cases/*.md`, if present — the confirmed actor goals and flows the architecture has to support.
- [`references/architecture-components.md`](references/architecture-components.md) — a reference menu of candidate components, not a checklist to walk mechanically. No entry is automatically in scope, and the project may need something it doesn't name — finding that is this skill's job.

If `intake/product-requirements.md` doesn't exist, stop and point the user at `prd-elicitation` first.

## Phase 1 — Propose the component map

Work out, from the inputs above and the catalogue, which components this project actually needs — including anything project-specific the catalogue doesn't name — and how they cluster: components that are mutually interdependent (their options genuinely co-vary, like a foundational frontend/backend/data stack) go into one conversation together; a component that merely *reads* another's settled decision is sequenced after it, not folded in.

**Check for gaps before drafting the map.** Walk every item in the PRD's "For the architecture step" list and every surface, integration, and actor named across the use cases, one at a time. For each, confirm it maps to a catalogue entry or flag it as a project-specific component the catalogue doesn't name. An item that maps to nothing is a gap, not something to drop — it still needs a component in the map, catalogue or not.

Present the whole map in one message, before discussing a single option:
- the components in scope, each with a one-line reason grounded in the PRD or use cases — not the catalogue's boilerplate
- the clusters they group into, and why
- the order the clusters will be settled in
- catalogue components deliberately left out, each with a one-line reason, so it reads as a decision rather than an oversight

Invite corrections — add, remove, merge, split, reorder. Move to Phase 2 once the user confirms the map, or immediately if they have none.

## Phase 2 — Settle each cluster

Work the clusters in the confirmed order. For each one:

1. **Ground it.** State the confirmed PRD/use-case facts, and any already-settled decision records, that constrain this cluster. Cite settled records by id and path — don't restate their content.
2. **Load current practice.** Before proposing anything, locate the `expert-reference` skill and use it rather than proposing from memory or improvisation. Run a couple of targeted searches on current practice for this component and stack combination. Keep "what practitioners are actually doing right now" separate from "what this project's constraints require" — say which is which, so the user can push back on either independently.
3. **Propose options.** Offer two or three genuine options — or state plainly that the choice is mandated with no real alternative, and cite the constraint that mandates it. Score each option against four axes: **prompt coherence**, **failure surface**, **reversibility**, **operational simplicity**. Never fabricate an option just to have three.
4. **Confirm explicitly.** Silence is not agreement. Let the user challenge the axis scoring itself, not just the choice — re-propose if they do.
5. **Hand off immediately.** The moment the cluster is settled, invoke `capture-adrs` with the confirmed decision, its alternatives, and why they lost. Do this before moving to the next cluster — don't batch decisions to the end of the conversation.

## Throughout

- Zero components beyond the unavoidable ones is a valid outcome for an edge-case project — don't manufacture a decision nothing in the project needs.
- If a catalogue entry's ownership boundary doesn't fit this project's actual shape, confirm the adapted framing with the user before proposing options for it.
- A tangent that reveals a new component candidate mid-cluster gets added to the map — confirm it briefly — rather than silently folded into whatever cluster is currently open.
- One thread at a time. Don't stack a cluster's option proposal with the next cluster's grounding in the same message.

## Output

This skill writes nothing itself. Every settled cluster is recorded by `capture-adrs` as it's confirmed, one ADR per component. Once every cluster in the map is settled and nothing new has surfaced, close the conversation by listing every ADR written this session — path and one-line decision each.

Before closing, verify:

- [ ] Every component in the confirmed map has either a written ADR or an explicit, confirmed reason it needed none.
- [ ] Every ADR written this session appears in `docs/architecture/decisions/README.md`.
- [ ] No cluster was settled without an explicit user confirmation.
- [ ] Every catalogue component left out of scope was left out with a stated reason, not silently dropped.
