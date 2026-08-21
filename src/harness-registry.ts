// Canonical harness registry (ADR-0001). The single source of truth mapping
// each reserved harness code to the harness it identifies and where that
// harness expects skill content placed. `hatch import`'s resolution logic,
// the collision check, and any registry-browsing tooling all read this file
// rather than hardcoding their own copy of the reserved set.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface HarnessDefinition {
  code: string;
  skillsDir: string;
}

interface HarnessRegistryFile {
  harnesses: Record<string, HarnessDefinition>;
}

const registryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "harness-registry.json",
);

let cached: HarnessRegistryFile | undefined;

function loadRegistry(): HarnessRegistryFile {
  if (!cached) {
    cached = JSON.parse(
      readFileSync(registryPath, "utf8"),
    ) as HarnessRegistryFile;
  }
  return cached;
}

export function knownHarnessNames(): string[] {
  return Object.keys(loadRegistry().harnesses);
}

// Every reserved harness suffix code, for the tooling that reasons about
// folder *names* rather than about a named harness — `hatch list`'s
// `<base>-<code>` folding (UC-6) is the case this exists for. Read from
// here rather than restated, per this file's own single-source rule.
export function reservedHarnessCodes(): string[] {
  return Object.values(loadRegistry().harnesses).map(
    (definition) => definition.code,
  );
}

export function isKnownHarness(name: string): boolean {
  return name in loadRegistry().harnesses;
}

export function getHarnessDefinition(name: string): HarnessDefinition {
  const definition = loadRegistry().harnesses[name];
  if (!definition) {
    throw new Error(`Unknown harness "${name}"`);
  }
  return definition;
}

// Per ADR-0001: prefer the harness-specific suffixed variant `<name>-<code>`,
// fall back to the unsuffixed default `<name>`, and report unavailable if
// neither exists. `folderExists` abstracts the registry lookup so this stays
// testable without a network call.
export async function resolveSkillFolderName(
  skillName: string,
  harnessName: string,
  folderExists: (folderName: string) => Promise<boolean>,
): Promise<string | undefined> {
  const { code } = getHarnessDefinition(harnessName);
  const suffixed = `${skillName}-${code}`;
  if (await folderExists(suffixed)) {
    return suffixed;
  }
  if (await folderExists(skillName)) {
    return skillName;
  }
  return undefined;
}
