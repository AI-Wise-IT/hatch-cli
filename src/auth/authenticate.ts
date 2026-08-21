// The session step every registry command performs before reading anything
// (UC-3 step 3, UC-6): resolve an already-persisted session per ADR-0005's
// precedence, or prompt once for a token, validate it against GitHub and
// persist it on success.
//
// Shared rather than copied so that `hatch import` and `hatch list` cannot
// drift into authenticating differently — the caller supplies only its own
// command prefix and suffix around the returned error, keeping each
// command's own reporting conventions intact.

import { promptHidden } from "../cli/prompt.js";
import { resolveToken, writeCredentials } from "./credentials.js";
import { validateGitHubToken } from "./github-token.js";

export type AuthenticateResult = { token: string } | { error: string };

// A validation failure that is really a connectivity problem, not a bad
// credential — reported as unreachable so a developer isn't told their
// password is wrong when the network is what's wrong.
function isNetworkFailure(reason: string | undefined): boolean {
  return (
    typeof reason === "string" && reason.startsWith("could not reach GitHub")
  );
}

// Returns either the resolved token or a reportable error string
// (unprefixed — callers prepend their own "hatch <command>: ..." framing).
export async function authenticate(): Promise<AuthenticateResult> {
  const existing = resolveToken();
  if (existing) {
    return { token: existing };
  }

  const candidate = (
    await promptHidden("Registry personal access token: ")
  ).trim();
  if (!candidate) {
    return { error: "no token provided" };
  }

  const validation = await validateGitHubToken(candidate);
  if (!validation.valid) {
    return {
      error: isNetworkFailure(validation.reason)
        ? `registry unreachable (${validation.reason})`
        : `invalid password (${validation.reason})`,
    };
  }

  writeCredentials(candidate);
  return { token: candidate };
}
