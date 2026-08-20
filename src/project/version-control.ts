// The single place where Hatch decides whether a project participates in
// version control, and the only place that commits.
//
// Git is an optional dependency: Hatch never creates a repository (project
// creation, and the `git init` that belongs to it, live outside the CLI),
// and every command completes its work normally without one — skipping only
// the commit, and warning that it did.
//
// Recognition is deliberately repo-*root*-only. A project that merely sits
// inside an enclosing repository's work tree counts as not version-
// controlled: Hatch must never write commits into a repository whose root it
// does not own, where they would mix with whatever unrelated work happens to
// be staged there. The accepted cost is that a monorepo-nested project warns
// on every invocation about content that is in fact tracked.

import { CheckRepoActions, simpleGit } from "simple-git";

export interface VersionControl {
  // True only when the project directory is itself a git repository root.
  readonly versionControlled: boolean;
  // Records the caller's entire effect as exactly one commit when the
  // project is version-controlled; a no-op when it isn't.
  commit(message: string): Promise<void>;
}

// Resolved once per command, at entry — after the target project is known
// and before anything is mutated. Emitting the warning here rather than at
// commit time is what makes it reach the developer on a command that aborts
// before it would ever have committed, which is exactly when knowing there
// is no recovery point matters most.
export async function openVersionControl(
  commandName: string,
  projectPath: string,
): Promise<VersionControl> {
  const git = simpleGit(projectPath);
  let versionControlled: boolean;
  try {
    versionControlled = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  } catch {
    // Detection itself failed — git missing from PATH, or unusable here.
    // Treated as "not version-controlled" so the command still does its
    // work, which is the whole point of git being optional.
    versionControlled = false;
  }

  if (!versionControlled) {
    // Every invocation, never suppressed after a first occurrence, and
    // never conditional on the operation being destructive.
    console.log(
      `${commandName}: warning: "${projectPath}" is not a git repository — nothing will be committed, and this operation cannot be undone through version control.`,
    );
  }

  return {
    versionControlled,
    async commit(message: string): Promise<void> {
      if (!versionControlled) {
        return;
      }
      await git.add(".");
      await git.commit(message);
    },
  };
}
