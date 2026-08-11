// Registry credential resolution and persistence (ADR-0005).
// Precedence for every command needing registry access: HATCH_TOKEN env var
// first; if unset, fall back to the home-directory credentials file at
// ~/.hatch/credentials.json. Never inside a project's own repo tree.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface StoredCredentials {
  token: string;
}

function credentialsDir(): string {
  return join(homedir(), ".hatch");
}

function credentialsPath(): string {
  return join(credentialsDir(), "credentials.json");
}

// Resolves the registry credential per ADR-0005's precedence. Reusable by any
// command that needs an authenticated session, not just `hatch login` itself.
export function resolveToken(): string | undefined {
  if (process.env.HATCH_TOKEN) {
    return process.env.HATCH_TOKEN;
  }
  return readStoredToken();
}

function readStoredToken(): string | undefined {
  const path = credentialsPath();
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as StoredCredentials;
    return typeof parsed.token === "string" ? parsed.token : undefined;
  } catch {
    return undefined;
  }
}

export function writeCredentials(token: string): void {
  mkdirSync(credentialsDir(), { recursive: true, mode: 0o700 });
  const body: StoredCredentials = { token };
  writeFileSync(credentialsPath(), `${JSON.stringify(body, null, 2)}\n`, {
    mode: 0o600,
  });
}
