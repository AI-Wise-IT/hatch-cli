// `hatch check-collisions` (UC-5, ADR-0014, ADR-0024): the CLI-exposed,
// directly invocable surface for the registry destination-path collision
// check. Never fetches anything itself — it scans a local skill-content
// registry checkout, per UC-5's own business rule. Invoked from both
// directions ADR-0014 describes: hatch-skills' own CI (after installing the
// published @ai-wise/hatchcli) runs it against its own PR'd checkout;
// hatch-cli's CI runs it (built from the PR branch) against a freshly
// cloned hatch-skills checkout.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkRegistryCollisions,
  formatCollisionReport,
} from "../registry/collision-check.js";

function parseArgs(
  argv: string[],
): { registryPath: string } | { error: string } {
  let registryPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--registry-path") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--registry-path requires a value" };
      }
      registryPath = value;
    } else {
      return { error: `unrecognized argument "${arg}"` };
    }
  }

  if (!registryPath) {
    return { error: "--registry-path <path> is required" };
  }

  return { registryPath: resolve(registryPath) };
}

export async function runCheckCollisions(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch check-collisions: ${parsed.error}`);
    return 1;
  }

  if (!existsSync(parsed.registryPath)) {
    console.error(
      `hatch check-collisions: registry checkout "${parsed.registryPath}" does not exist`,
    );
    return 1;
  }

  const result = await checkRegistryCollisions(parsed.registryPath);
  console.log(formatCollisionReport(result));
  return result.ok ? 0 : 1;
}
