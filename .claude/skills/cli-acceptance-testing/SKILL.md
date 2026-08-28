---
name: cli-acceptance-testing
description: Produces a manual, step-by-step acceptance-test walkthrough for a CLI command or feature, written to a standalone markdown document — single-line, fully-qualified, copy-pasteable commands, one per step, covering the happy path plus alternative flows and edge cases, with one clearly stated location to observe every effect and a teardown that removes the scratch directory and the document itself. Use this whenever someone wants to acceptance-test, manually verify, or "walk through testing" a CLI command or change themselves in their own terminal — phrases like "let's acceptance test this", "give me a manual test script", "I want to verify this myself", "walk me through testing this by hand", "give me some commands to test this", or an explicit /acceptance-test invocation. Trigger even without the words "acceptance test" whenever someone is clearly asking for a hands-on script to exercise command-line behavior step by step, rather than an automated test suite.
---

# CLI Acceptance Testing

Use this whenever someone wants to manually exercise a CLI command or feature they just built or changed — running real commands in their own terminal and watching it happen, rather than (or in addition to) an automated test suite. The output is a walkthrough script for a human to copy-paste one line at a time, not a test file for CI.

## Deliver it as a document

Write the walkthrough to a markdown file and tell the user its path. Someone runs these steps over a stretch of time, in their own terminal, checking off progress — that needs a file they can keep open beside the terminal, not a wall of chat scrollback they have to scroll back through and lose their place in.

- **Where:** the root of the session's working directory, named for what is being tested (e.g. `<working-dir>\<feature>-walkthrough.md`). It **must** live inside the working directory — Claude's file viewer refuses to open anything outside it ("it lives outside the working directory"), and a document the user cannot open in the side panel defeats the point.
- Put it **outside the scratch directory** — the walkthrough resets that directory partway through, which would delete the document mid-run. The working-directory root and the scratch directory must be two different places.
- When the working directory is a repo, the file will show as untracked. Say so in the document itself, in one line next to the teardown step, and tell the user not to commit it. Do not add it to `.gitignore` — that is a repo change nobody asked for, and teardown removes the file anyway.
- Also give the steps in the chat reply, so they are readable without opening anything. The document is the copy that survives the conversation.

## Why this shape

A script meant to be pasted one line at a time only works if any single line can be run in isolation — in any order, in a fresh terminal, weeks later — and still behave correctly. A shared shell variable set in step 3 that step 7 quietly depends on breaks the moment someone re-runs step 7 on its own after lunch. Every rule below exists to avoid that failure mode, not for its own sake.

## Environment (fixed — don't ask)

This skill runs in one specific, known setup, so skip the interview questions a fully generic version would need:

- **Shell:** Windows PowerShell. Every command and code fence uses PowerShell syntax, tagged `powershell`.
- **Terminal starting directory:** `C:\Users\simon`. Every path in the script is fully-qualified regardless (per the rules below), so this mainly just means never emitting a bare relative path or a `cd` and assuming it'll work.

## Before writing anything, figure out what's being tested

Two things are still worth confirming, inferred confidently from the project rather than asked as an interview when the answer is already obvious from context (build scripts, `package.json`, an existing `dist/`):

- **How to invoke the tool under test** — the built binary or entrypoint's absolute path, and whether a build step is needed first.
- **Scope** — the command/feature, its main/happy-path flow, and every alternative flow, flag, or error case that matters.

- If a batch, PR, or feature was just implemented earlier in the conversation, that's the primary source for scope — pull its main flow and every alternative flow directly from the use-case doc, ADRs, build-plan entry, or tests backing it, not from re-deriving it from memory.
- Otherwise, use whatever the user just described, plus the project's own docs/tests for that command if any exist.
- Cover **every** alternative flow and edge case the spec/tests/docs actually define — don't curate a subset or ask which ones to include; that back-and-forth is exactly what this skill exists to skip. Only when the project genuinely doesn't define its own edge cases, fill in from what's typical for CLI commands (invalid or missing arguments, a prerequisite that isn't met, an already-in-the-target-state no-op, a destructive action's confirmation or force-flag, incompatible flag combinations) — and include those directly too, rather than offering them as a menu to approve.

## Output format

A sequence of steps. Each step is:

- one line describing what's being tested and what to expect, then
- exactly one command, alone in its own fenced code block tagged `powershell`, on a single line — no leading prompt character (`$`, `PS>`), no output mixed in.

Every command uses fully-qualified absolute paths, both for the tool being invoked and for any scratch/target location — never a bare relative path, and never a shell variable set in an earlier step. Someone should be able to run step 9 alone, from a brand-new terminal, and have it work. The one exception is trivial setup/teardown (e.g. resetting a scratch folder), where chaining two housekeeping actions on one line with `;` is fine, since that's not part of the behavior under test.

Structure the steps as:
1. Build/prepare, if the tool needs compiling.
2. Reset one scratch/working directory — a single reusable location for the whole walkthrough, not a fresh one per step.
3. The main/happy-path flow, in the order a real user would hit it.
4. Each alternative flow or edge case as its own labeled step, including whatever fixture setup it needs (e.g. hand-editing a file to simulate drift, or deleting something to simulate an outside change) as its own separate one-line command rather than folded into the step under test.
5. A final teardown step that removes **both** the scratch directory **and the walkthrough document itself**, leaving the machine as it was found. Guard each removal with an existence check so the step is safe to re-run. The document is disposable once the walkthrough has been run — leaving it behind means the next person finds a stale script describing a build that has since moved on.

State once, before the steps begin — not repeated per step — the single location where every effect can be observed (the scratch directory's path, plus, if relevant, one command to check history/logs there, e.g. a `git log` invocation scoped to that directory). The person following along should be able to open that one location and see everything that happened by clicking through it.

## Example step shape

Each step in the final output looks like this (a bold one-line label, then a single fenced command — indented here only so it renders as a literal example inside this doc rather than as an actual fence):

    **Step 4 — <what this checks, and what to expect>**
    ```powershell
    <tool> <subcommand> <args> --<target-flag> "<absolute-scratch-path>"
    ```

## What this skill is not

Not a substitute for the project's automated test suite — it's for someone who wants to watch the real thing happen with their own eyes. If what's actually wanted is automated tests, that's a different task.
