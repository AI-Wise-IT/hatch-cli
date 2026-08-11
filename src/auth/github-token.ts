// Validates a candidate registry password (a GitHub personal access token,
// per ADR-0005) against GitHub itself.
//
// GET /user is the lightest authenticated call GitHub's API offers: it
// requires no scopes beyond a token being valid, and costs nothing against
// rate limits worth worrying about for a single interactive login. It proves
// the token is a live GitHub credential without needing to reach the actual
// private skill-content repo (ADR-0003) — that repo-specific reachability
// check belongs to the commands that fetch content, not to login itself.

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
}

export async function validateGitHubToken(
  token: string,
): Promise<TokenValidationResult> {
  let response: Response;
  try {
    response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "hatchcli",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, reason: `could not reach GitHub (${message})` };
  }

  if (response.ok) {
    return { valid: true };
  }

  if (response.status === 401) {
    return {
      valid: false,
      reason: "GitHub rejected the token as invalid or expired",
    };
  }

  return {
    valid: false,
    reason: `GitHub responded with an unexpected status (${response.status})`,
  };
}
