---
name: ship-accepted-change
description: Carries an implemented change from "the acceptance test passed" all the way to published — opens the reviewed PR, waits for CI and automated review, verifies and fixes findings, merges, archives the change and syncs its specs, then cuts and publishes the release. Use this whenever the developer confirms a manual acceptance test has passed and the change is ready to go out — phrases like "acceptance test passed", "I've accepted it", "ship it", "deploy this", "cut the release", "take it from here", or an explicit /ship-accepted-change invocation. Trigger only after the developer has actually confirmed acceptance; the confirmation is what authorises the unattended merges and the publish.
---

# Ship an accepted change

Everything after a developer accepts an acceptance test is repetitive and easy to get half-right: the PR, the review wait, the findings, the merge, the archive, the spec sync, the version bump, the tag. This runs that sequence.

## The precondition is the authorisation

**The developer must have confirmed that a manual acceptance test passed.** Not "the tests pass" — a human ran the walkthrough and said it works.

That confirmation is the only thing authorising the unattended merges and the publish downstream. So state it back explicitly before starting:

> Shipping `<change-name>` — the developer accepted it based on the acceptance test.

If acceptance has not been confirmed, **stop and ask for it**. Do not infer acceptance from a green test suite, from an earlier approval of a different step, or from the developer asking you to ship.

## Preconditions to check, not assume

- A change with completed implementation, and its planning artifacts (OpenSpec or equivalent).
- Automated review is **opt-in by label** in the target repositories. Confirm the label name in `.greptile/config.json` (`labels`) before opening the PR. Currently `review`.
- Publishing runs off a tag, not a merge. Confirm the trigger in `.github/workflows/release.yml` before relying on it.
- Whether the change spans **more than one repository**. Ask if it is not obvious. A companion repo needs its own PR, its own checks, and its own merge.

---

## 1. Close out the change locally

- Tick the acceptance-test tasks in `tasks.md`. Acceptance is the trigger, so those tasks are done by definition.
- Confirm **every** task is complete. If any is not, stop and report which — do not tick something you did not verify.
- Delete the acceptance walkthrough document if one exists.
- Run the full gate set and report each result: lint, typecheck, tests, build, plus whatever the project adds — decision-record conformance, frozen-section immutability, reviewer-delegation checks, `openspec validate --all --strict`.

Any gate that will not go green is a **stop**.

## 2. Open the implementation PR

- Branch first if on the default branch.
- **Stage files by name.** Never `git add -A` or `git add .` — untracked scratch files (acceptance walkthroughs, probes, notes) live alongside real work and must not be committed.
- Conventional commit message. Explain *why*, not just what. End with the project's `Co-Authored-By` line.
- Push, open the PR, and **apply the review label**.

The label is load-bearing. Review is opt-in: without it no review is ever produced, and step 3 waits forever on something that is not coming.

Companion repositories: same sequence, their own PR, their own label.

## 3. Wait for both gates

**CI:** every check green.

**Automated review:** a review exists for this PR. Confirm it covers the current head — the summary comment names the last reviewed commit; compare it against the PR head SHA. A review of an older commit is not a review of this PR.

**Watch the PR for up to 10 minutes.** Measured on this project, the review lands between one and three and a quarter minutes after the PR opens, the slowest being a sixteen-file code change. Ten minutes is roughly triple the worst observed, which is deliberate slack rather than a tight bound.

If nothing has arrived by then, **stop and return to the developer.** Say how long you waited and what the PR looks like. **Do not re-trigger the review yourself** — a review that has not appeared is a signal about the reviewer or its configuration, and re-triggering hides that signal behind a retry. The most likely cause is a missing review label, which is worth telling the developer rather than working around.

Never merge past this gate on the grounds that it never ran.

## 4. Findings: verify, then act

**Verify each finding against the code before touching anything.** Read the lines it names and establish for yourself whether the failure it describes is real. A finding is an opinion from a tool, not an instruction.

Then, per finding:

- **Valid and obvious** — fix it immediately, with a regression test that fails without the fix.
- **Wrong** — say so plainly, with the reasoning. Never edit correct code to satisfy an incorrect finding.
- **Needs the developer's judgment** — **stop**. State the finding, your verification, the options and your recommendation. Anything that changes agreed scope, weakens specified behaviour, or trades off against something the developer already decided belongs here.

**After fixing, re-check that the records and specs still describe reality.** A fix frequently invalidates an architecture record or spec written earlier in the same change — the fix ships and the record quietly starts lying. Reconcile them in the same commit.

**Then document the mitigation on the PR.** Reply to each finding's own thread with what was done and why; add one summary comment covering the set. Do not expect the reviewer to re-review after a push — it often will not, and its posted verdict stays stale. The comment *is* the record that the findings were addressed, so write it for someone reading the PR a year from now.

Leave the threads unresolved. They belong to the reviewer, and outdated-plus-answered is more honest than closed by the author of the code.

Push the fixes and confirm CI is green again. Do not wait for a second review.

## 5. Merge the implementation PR

Automatic once CI is green and every finding is fixed, dismissed with reasons, or escalated and answered. No approval needed — acceptance covered it.

Merge companion PRs too. Note any ordering constraint between repositories, and say plainly when there is none.

## 6. OpenSpec: sync the specs, then archive the change

This step is the **OPSX** workflow — `/opsx:sync` followed by `/opsx:archive`, or the archive skill's own inline sync, which performs both. Use those skills rather than moving directories by hand; they carry the completion checks, the sync assessment and the validation this step depends on.

Pull the default branch first.

**Sync before archiving, and verify before moving.** The order matters: `/opsx:archive` relocates the change directory out from under anything still reading it, so a sync left running in the background gets its source moved mid-read — leaving the change archived and the main specs never updated.

- Run the sync inline and wait for it. Promote the change's delta specs into the main specs: a new capability becomes a new main spec; a modified one merges into the existing spec, preserving requirements the delta does not touch.
- **Verify the promotion before archiving**: requirement and scenario counts match between delta and main spec, the header structure diffs clean, and `openspec validate --all --strict` passes for the change and every spec it touched. If anything differs, stop — nothing has moved yet, so it is still cheap to fix.
- Only then archive to `archive/YYYY-MM-DD-<name>/`. Confirm `.openspec.yaml` travelled with it; it is hidden, so a plain listing will not show it.

Open the PR, let CI pass, merge without asking. **No review label** — this is bookkeeping for work already reviewed.

## 7. Cut and publish the release

**Version.** Whatever the developer specified when invoking this skill wins. Absent that, decide from the change type:

- **patch** — fixes to behaviour that was already specified
- **minor** — behaviour a consumer can observe changing, or a new capability
- **major** — only above 1.0, and only for a break

**Bump.** `package.json` plus the project-level fields in `package-lock.json` — the root `version` and the `packages[""].version`. Check the diff: a dependency that happens to share the old version number must not be caught.

**Commit** as `chore(release): X.Y.Z`, and write the upgrade story rather than the version number. If the release migrates consumers' projects, moves files, or changes where anything lands on disk, say so — that text is what someone reads when it surprises them.

Open the PR, let CI pass, merge without asking.

**Publish.** Pull the default branch, then push the tag:

```
git tag v<version> && git push origin v<version>
```

The merge publishes nothing; the tag is what runs the release workflow. Then **verify the publish landed** — the workflow succeeded, and the new version is actually live on the registry. A release that silently failed to publish looks exactly like one that worked.

---

## Stop and ask, in exactly these cases

1. Acceptance was never confirmed by the developer.
2. A finding needs their judgment.
3. A gate will not go green.
4. The initial review never arrives.
5. A task is not actually complete.

Everywhere else, proceed. That is the point of the skill.

## Never

- `git add -A` or `git add .` — stage by name.
- `git checkout`, `git restore`, `git reset`, `git clean`, `git stash`. A repository with CRLF-versus-formatter noise shows most files as modified and actively baits these; one of them destroyed four files of uncommitted work in this project's history. If you think you need one, stop and report.
- Repo-wide formatting (`npm run format`) to satisfy a linter. Format only the files you touched, naming each.
- Merging past a gate that never ran.
- Editing correct code to satisfy an incorrect finding.

## Report at the end

Every PR with its URL and what it carried, the findings and how each was resolved, what got archived and which specs were promoted, the version published and the evidence it is live, and anything left for the developer.
