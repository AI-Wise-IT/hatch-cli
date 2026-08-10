# Use Case: Authenticate to the Registry

## Overview

- **ID:** UC-2
- **Name:** Authenticate to the Registry
- **Primary Actor:** Developer
- **Outcome:** The developer is authenticated against the registry, so subsequent commands (like `hatch import`) can fetch content from it. This is a precondition for importing, not a step inside importing — it's a distinct trigger (`hatch login`) with its own outcome (an authenticated session).

## Preconditions

- The developer has the Hatch CLI installed and available.
- The developer possesses the registry's personal password.

## Main Success Scenario

1. Developer runs `hatch login`, providing the personal password.
2. System validates the password against the registry.
3. Developer is authenticated; the CLI persists the session so subsequent commands don't require re-entering the password for its duration. (Exact persistence mechanism — how this is done securely on a local desktop vs. inside an isolated cloud agent environment without committing secrets to the target project's repo — is an open technology question deferred to the architecture step.)

## Alternative Flows

### AF-1: Invalid password
Triggered at step 2 when the supplied password doesn't match.
- System rejects the authentication attempt.
- Developer is informed the password is invalid.
- No session is established.
- Terminates in Failure.

## Postconditions

- **Success:** The developer holds an authenticated session with the registry; subsequent `hatch import` commands can fetch content without re-prompting for the password within that session's validity.
- **Failure:** No session is established. The developer remains unauthenticated and must retry `hatch login`.

## Business Rules

- The entire registry is private — there is no public/private split among skills. `hatch login` gates access to all of it, not a subset.
- Authentication uses a single shared personal password, not per-user accounts (the registry is explicitly not a public, multi-user app with account management).
- Logout is out of scope for this MVP — there is no mechanism to explicitly invalidate a session.

## Open Questions Carried to Architecture

- How the authenticated session persists and is supplied to subsequent commands, particularly reconciling a local desktop environment (where an env file or local secret store is viable) against an isolated cloud-agent environment (where committing a secret into the target project's git repo is not acceptable).
