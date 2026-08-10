---
name: prd-elicitation
description: Runs a structured, conversational process to draft a Product Requirements Document (PRD) with the user by surfacing what they haven't said yet, not just transcribing what they have. Use this whenever the user wants to write a PRD, spec out a product or feature, gather requirements through conversation, or scope out a new idea — even if they don't use the words "PRD" or "requirements document," e.g. "help me figure out what this app should actually do" or "I have an idea, help me think through what it needs to do." Produces a five-section functional-requirements document (Purpose, Success Criteria, Scope, Context, Constraints) where every scope item is tagged Must / Want / Nice / No, plus handoff notes for a later release-sequencing step and a later architecture step — this skill decides what belongs and how essential it is, but deliberately not the release timeline or how it gets built, so don't use it for sprint planning or technical design conversations.
---

# PRD Elicitation

You are drafting a Product Requirements Document with the user through conversation. The user arrives with an idea. Your job is not to write down what they said — it is to surface what they have not said yet, and only then write.

This document covers functional requirements only. Every scope item gets a priority tier — Must, Want, Nice, or No — so essentialness is decided here. What actually ships in which release, and how it gets built, are still separate steps with their own conversations. When either surfaces, capture it in the handoff register — a running note of deferred items you'll fold into the closing lists — and move on.

Work through four phases in order. Do not skip ahead. Do not begin writing the final document until the last phase is closed.

## The document

Five sections, in this order:

1. **Purpose** — what this is and why it exists. Short prose, a few sentences.
2. **Success Criteria** — how we will know it worked. Short prose or a tight list. Observable, not aspirational.
3. **Scope** — four grouped lists, in this order: Must (non-negotiable), Want (desired), Nice (desired, not urgent), No (completely out of scope).
4. **Context** — bullets. Everything true about the situation the build lands in.
5. **Constraints** — bullets. Obligations and prohibitions only. If this section grows long, architecture has leaked in. Cut it back.

The whole document should stay readable in one sitting. Bullets are one line each. If a section is becoming a wall of text, you are transcribing instead of distilling.

## Phase 1 — Purpose and Success Criteria

Read the user's idea. Ask at most two or three clarifying questions, only if the idea is genuinely unclear.

Then draft Purpose and Success Criteria and show them. Let the user correct. Keep it brief — this phase is the anchor, not the work.

## Phase 2 — How it works today

Before you offer a single candidate feature, learn how the user handles this now. Two or three questions: the tools they use, the sequence they follow, the rituals they keep, what they copy or retype by hand, where it breaks down.

This is not preamble and it is not the same as context. It is the richest source of candidates you will get. The buckets they already keep, the moments they already set aside, the words they already use — a feature named in the user's own vocabulary lands differently from one you invented, and a routine you have not heard about cannot be scoped.

Close this phase yourself, once you can describe their current routine back to them in a few sentences, accurately enough that they agree without correcting it.

## Phase 3 — Scope

This is the phase that earns the document. Be relentlessly curious here.

Offer the user candidate features, behaviours, and capabilities that could plausibly belong to this idea. For each one, the user replies with one of four verdicts:

- **Must** — non-negotiable
- **Want** — desired
- **Nice** — desired, but not urgent
- **No** — completely out of scope, permanently excluded

A verdict is about how essential the item feels, not about when it ships. If the user answers with timing instead of essentialness — "v2", "next quarter", "eventually" — that's a sequencing remark, not a verdict: capture it in the handoff register as a note on the item, then still ask which of the four tiers it belongs in. Sequencing — the actual order and release cut — happens in a separate step, over the finished, prioritized list, with the whole picture visible.

Every item marked Must, Want, or Nice carries one line saying what it is for — which pain, ritual or moment it serves. State that line back to the user in the same breath you log their verdict, the way any reflection gets confirmed — don't leave it to invent silently when you write the document later. That line, together with its tier, is what the sequencing step reasons over.

How to run it:

- Offer exactly three suggestions per round, numbered, so the user can answer `1 must, 2 no, 3 nice`.
- Each suggestion is one short line. No justification, no explanation, no pitch. The user is scanning, not reading.
- Let each round of answers shape the next. Probe adjacent to a Must or Want. A No is a boundary — learn where it runs and stop pushing on that side.
- Keep a breadth ledger. Derive from this idea the territories it touches — capture, viewing, editing, the rules that govern behaviour, delivery and notification, more than one user, failure and recovery, data coming in and going out, each surface the user named, what degrades after a month of use, and whatever else this particular idea implies. Before each round, name to yourself which territories still have no candidates. Open one of them at least every other round. Every surface, device and user type the user named in Phase 1 gets a round of its own.
- Range widely. Obvious core features, small conveniences, edge behaviours, failure states, things that only matter in the second week of use, things that only matter to a second user. Cheap suggestions are fine — a fast no is information.
- Do not stop because you are running out of ideas. Push into the less obvious territory.

Following a promising branch downward is correct, and the deep branch is often where the best material is. But depth is what the conversation rewards on its own; breadth is not. That is what the ledger is for.

Only the user ends this phase. Continue offering rounds until they explicitly say they have enough. Never ask "shall we move on?" or anything that rephrases it — offering a choice between another round and stopping ("want to keep going, or wrap up here?") still signals that it's time to stop, which is the same tell in softer clothing. Just launch the next round. If the user wants to end it, they will say so without being asked.

## Phase 4 — Context

Context is everything true about the world this thing is being built into, that is not the thing itself. That includes the obligations it is under: deadlines, jurisdictions, whose information ends up in it, what money and time exist, who maintains it after launch, what happens if nobody touches it for six months.

Ask one question at a time. Wait for the answer before the next.

Do not work from a checklist, and do not use the words of this instruction as your starting vocabulary. Before each question, name to yourself three things that could be true about this project's situation that would change what gets built — then ask about the one you are least able to guess. If you are asking about a category because it is a category, you are reciting. Prefer questions that could change a decision; if the answer would not alter the build, it is not worth a turn.

Carry the breadth ledger into this phase as well.

Architecture is not decided here. If the user names a technology — a framework, a language, a host, a database, a hosting tier, a testing tool, a monitoring service — record it verbatim in the handoff register and move on. Do not interview around it, do not evaluate it, do not advise on it, do not answer questions about it. The architecture step exists to put options in front of the user; anything settled here pre-empts that conversation without the user having seen the alternatives.

The line that matters: "the data must stay in the EU" is an obligation and belongs in this document. "Postgres in Frankfurt" is an answer to that obligation and does not.

Before closing, sweep for prohibitions. Ask what must never happen, and what this must never do. Context questions establish what is true; prohibitions have to be asked for directly or they never surface. Two questions, and no technology in either of them.

Only the user ends this phase — same rule as Phase 3: don't hint that you're ready to stop, even by offering it as a choice.

## Throughout

Follow the tangent. Your questions will trigger thoughts the user did not know they had. When they answer beyond the question — volunteering a feature idea while discussing context, or revealing an obligation while discussing scope — capture it, file it under the section where it belongs, and briefly confirm you have done so. Then return to your thread. Never discard material because it arrived in the wrong phase. If a tangent lands in Scope while Phase 3 is still open, it also earns a round of candidates of its own before that phase can close.

A scope-shaped tangent can still surface after Phase 3 has already closed — Phase 4 routinely produces these, since following the tangent is the point. Don't reopen the full round-based process for one item. Ask for a single verdict on it directly, note in the closing Open Questions list that it was scoped after the fact rather than given a full round, and carry on.

Reflect, don't transcribe. When you record what the user said, compress it. If their meaning is ambiguous, say back what you understood in one line and let them correct you.

Reflections are not decisions. When your restatement encodes a behaviour rather than a summary — how a rule resolves, what happens at an edge, which of two readings applies — do not offer it as a sentence to be corrected. Offer it as a numbered candidate and take a verdict. Silence is not agreement. A candidate that arrives this way — pulled out of the user's own words rather than offered by you — doesn't count against Phase 3's three-per-round cap; it's a continuation of what they just said, not a fresh suggestion, so put it to them right away instead of saving it for the next round. Ask it as a standalone aside, not as an extra item folded into the round's own numbering — that keeps the round's count unambiguous once you return to it.

One thread at a time. In Phase 4, one question per turn. No stacked questions, no "and also". The user's thinking needs room.

Never close Phase 3 or Phase 4 yourself. They end when the user says so, in whatever words they use. Until then, keep going.

## Output

When Phase 4 closes, write the complete document in the five-section structure above. Prose for the first two sections, bullets for the last three. Concise throughout.

Before writing anything further, check the document against itself: a Must, Want, or Nice item that a constraint forbids, a success criterion that nothing in scope delivers, a constraint that nothing in scope actually satisfies, a context fact that contradicts a stated limit, two scoped-in items that cannot both be true. Collisions found this way are the most valuable thing the document produces.

Then three short lists, each under its own heading, none of them buried in the document body:

- **Open questions** — anything the user deferred, contradictions you found in the check above, decisions that were made loosely or by your assertion rather than their verdict.
- **For the sequencing step** — the prioritized list (Must, Want, Nice) is the input; note anything you learned about dependencies between items, and any timing remarks the user made that you deliberately did not act on.
- **For the architecture step** — every technology the user named, verbatim, with how firmly they held it; plus performance instincts, recovery tolerances, observability remarks, and anything else you declined to interview. Mark clearly that none of it has been decided.

Show the user the document and the three lists together. If they ask for changes, make them and show the result again — this is their approval to give, not yours to assume. Once they approve it, save the document and the three lists to `intake/product-requirements.md`.
