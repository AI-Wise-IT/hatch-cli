// `hatch login` (UC-2): prompts for the registry's GitHub personal access
// token, validates it against GitHub, and persists it per ADR-0005 on
// success. AF-1 (invalid password): rejects clearly and leaves any
// previously-stored credential untouched.

import { writeCredentials } from "../auth/credentials.js";
import { validateGitHubToken } from "../auth/github-token.js";
import { promptHidden } from "../cli/prompt.js";

export async function runLogin(): Promise<number> {
  const token = (await promptHidden("Registry personal access token: ")).trim();

  if (!token) {
    console.error("hatch login: no token provided — nothing was changed.");
    return 1;
  }

  const result = await validateGitHubToken(token);
  if (!result.valid) {
    console.error(
      `hatch login: invalid password (${result.reason}) — nothing was changed.`,
    );
    return 1;
  }

  writeCredentials(token);
  console.log(
    "hatch login: authenticated. Session saved to ~/.hatch/credentials.json.",
  );
  return 0;
}
