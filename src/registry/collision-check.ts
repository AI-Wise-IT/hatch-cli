// Registry destination-path collision detection (UC-5, ADR-0014, ADR-0024).
// Scans a local skill-content registry checkout (no network fetch — per
// UC-5's own business rule, this operates only on what's already checked
// out) and reports any destination name claimed by more than one distinct
// physical registry source.
//
// Per ADR-0024, a collision exists only between distinct physical sources:
// a top-level standalone skill folder (its own literal name is always its
// deployed destination, per ADR-0001 — the harness-suffix code is stripped
// at deploy time regardless of which sibling variant resolves) and a
// group's nested member folder (`<group>/<member-name>/`). A pointer member
// never introduces a new claim — it only references an already-existing
// top-level entry, and the same skill being pointed to by multiple groups
// is the intended reuse case, not a collision. This predicate is therefore
// structural (destination = folder/member name) rather than harness-
// dependent, but the check still runs once per harness the CLI currently
// supports — reusing `resolveSkillFolderName` per ADR-0001 to confirm each
// standalone folder's actual harness-suffix resolution, and reporting which
// harness(es) a collision affects — per ADR-0014's explicit requirement,
// and to stay correct if group/pointer resolution ever becomes
// harness-aware in the future.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  knownHarnessNames,
  resolveSkillFolderName,
} from "../harness-registry.js";
import { parseGroupSkillJson } from "./group-resolve.js";

export interface CollisionSource {
  // "standalone" — a top-level skill folder's own name.
  // "nested" — a group's nested member, at "<group>/<member-name>".
  kind: "standalone" | "nested";
  path: string;
}

export interface Collision {
  destination: string;
  harnesses: string[];
  sources: CollisionSource[];
}

export interface RegistryReadError {
  folder: string;
  detail: string;
}

export interface CollisionCheckResult {
  ok: boolean;
  collisions: Collision[];
  // A folder whose skill.json couldn't be read/parsed at all (e.g.
  // malformed JSON) — reported as its own actionable failure rather than
  // crashing the whole check, since this runs unattended in CI.
  errors: RegistryReadError[];
}

function listTopLevelRegistryFolders(registryPath: string): string[] {
  return readdirSync(registryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(registryPath, name, "skill.json")))
    .sort();
}

async function localFolderExists(
  registryPath: string,
  name: string,
): Promise<boolean> {
  return existsSync(join(registryPath, name));
}

// Runs the destination-path collision check against a local registry
// checkout at `registryPath` (the skill-content repo's own root — every
// top-level folder with a skill.json is a candidate skill or group).
export async function checkRegistryCollisions(
  registryPath: string,
): Promise<CollisionCheckResult> {
  const topLevelFolders = listTopLevelRegistryFolders(registryPath);
  const harnesses = knownHarnessNames();

  // destination -> sourcePath -> claim kind. A Map (not a count) so two
  // "nested" claims at literally the same source path (impossible — a
  // group can't list the same nested name twice without one overwriting
  // the other in `size`) still collapse correctly, while two distinct
  // source paths sharing a destination are preserved as separate entries.
  const claims = new Map<string, Map<string, CollisionSource["kind"]>>();

  function addClaim(
    destination: string,
    sourcePath: string,
    kind: CollisionSource["kind"],
  ) {
    let bySource = claims.get(destination);
    if (!bySource) {
      bySource = new Map();
      claims.set(destination, bySource);
    }
    bySource.set(sourcePath, kind);
  }

  const standaloneFolders: string[] = [];
  const errors: RegistryReadError[] = [];

  for (const folderName of topLevelFolders) {
    let meta: ReturnType<typeof parseGroupSkillJson>;
    try {
      // A UTF-8 BOM (common from some editors/shells, e.g. PowerShell's
      // `Set-Content -Encoding utf8`) isn't valid JSON's first character —
      // strip it before parsing. `BOM` is a one-character string holding
      // code point U+FEFF (invisible in most editors/diffs).
      const BOM = String.fromCharCode(0xfeff);
      const raw = readFileSync(
        join(registryPath, folderName, "skill.json"),
        "utf8",
      );
      meta = parseGroupSkillJson(
        raw.startsWith(BOM) ? raw.slice(BOM.length) : raw,
        folderName,
      );
    } catch (error) {
      errors.push({
        folder: folderName,
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (meta.members) {
      for (const member of meta.members) {
        if (member.kind === "nested") {
          addClaim(member.name, `${folderName}/${member.name}`, "nested");
        }
        // Pointer members reference an existing top-level entry — no new
        // claim (ADR-0024).
      }
    } else {
      standaloneFolders.push(folderName);
      addClaim(folderName, folderName, "standalone");
    }
  }

  // Reuse ADR-0001's resolution algorithm, once per harness, per standalone
  // folder — confirms each folder's harness-suffix resolution actually
  // succeeds (it always does: the plain fallback is the folder's own name)
  // without deriving any additional destination from it. The deployed
  // destination for a standalone folder is always its own literal name
  // (ADR-0001), never the resolved sibling's name.
  for (const harness of harnesses) {
    for (const folderName of standaloneFolders) {
      const resolved = await resolveSkillFolderName(
        folderName,
        harness,
        (candidate) => localFolderExists(registryPath, candidate),
      );
      if (!resolved) {
        throw new Error(
          `internal error: "${folderName}" did not resolve for harness "${harness}" against its own registry checkout`,
        );
      }
    }
  }

  const collisions: Collision[] = [];
  for (const [destination, bySource] of claims) {
    if (bySource.size > 1) {
      collisions.push({
        destination,
        harnesses,
        sources: [...bySource.entries()]
          .map(([path, kind]) => ({ path, kind }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      });
    }
  }

  collisions.sort((a, b) => a.destination.localeCompare(b.destination));
  errors.sort((a, b) => a.folder.localeCompare(b.folder));

  return {
    ok: collisions.length === 0 && errors.length === 0,
    collisions,
    errors,
  };
}

export function formatCollisionReport(result: CollisionCheckResult): string {
  if (result.ok) {
    return "No destination-path collisions found.";
  }
  const lines: string[] = [];
  if (result.errors.length > 0) {
    lines.push(`Could not read ${result.errors.length} registry folder(s):`);
    for (const error of result.errors) {
      lines.push(`  "${error.folder}": ${error.detail}`);
    }
  }
  if (result.collisions.length > 0) {
    lines.push(
      `Found ${result.collisions.length} destination-path collision(s):`,
    );
  }
  for (const collision of result.collisions) {
    lines.push(
      `  "${collision.destination}" (harness(es): ${collision.harnesses.join(", ")}):`,
    );
    for (const source of collision.sources) {
      lines.push(`    - ${source.path} (${source.kind})`);
    }
  }
  return lines.join("\n");
}
