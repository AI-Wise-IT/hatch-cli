// Group member-graph resolution (0013-registry-group-structure-and-permanence,
// 0016-group-member-manifest-format): given an already-fetched top-level
// group's `members` list, recursively resolves nested members directly and
// pointer members (including group-to-group pointers, at arbitrary depth)
// by following the reference — deduping by name via a visited set — into a
// flat list of leaf skill members ready for placement. Implements AF-9's
// pinned-pointer version-conflict rule: a name reached via two or more
// *pinned* pointer paths resolves to the highest pin with a warning when
// the pins share a MAJOR version, or aborts the whole resolution when they
// don't.

import { fetchRegistryFile, fetchRegistryFolder } from "./fetch.js";
import { REGISTRY_ONLY_FILES } from "./registry-only-files.js";

export interface NestedMemberSpec {
  kind: "nested";
  name: string;
}

export interface PointerMemberSpec {
  kind: "pointer";
  name: string;
  version?: string;
}

export type MemberSpec = NestedMemberSpec | PointerMemberSpec;

export interface GroupSkillJson {
  version: string;
  // Present (even if empty) only when the folder is a group; absent means
  // the folder is a plain skill.
  members?: MemberSpec[];
  // 0019-registry-removed-metadata-flag.md: true when this folder's own
  // skill.json flags it removed. Absent/false is the overwhelmingly common
  // case — active, normal content.
  removed?: boolean;
}

export interface ResolvedMember {
  name: string;
  version: string;
  // Path relative to the member's own root -> content. Never includes
  // registry-only files (skill.json, NOTE.md) — those are registry
  // metadata/authoring content, never deployed.
  files: Map<string, string>;
}

export type GroupResolveFailureReason =
  | "unreachable"
  | "not-found"
  | "invalid-members"
  | "major-conflict";

export type GroupResolveResult =
  | { ok: true; members: ResolvedMember[]; warnings: string[] }
  | { ok: false; reason: GroupResolveFailureReason; detail: string };

export class GroupResolveError extends Error {
  reason: GroupResolveFailureReason;
  constructor(reason: GroupResolveFailureReason, detail: string) {
    super(detail);
    this.reason = reason;
  }
}

// Parses a fetched folder's skill.json, classifying it as a group (has a
// `members` array) or a plain skill (no `members` field at all).
export function parseGroupSkillJson(
  raw: string | undefined,
  folderLabel: string,
): GroupSkillJson {
  if (!raw) {
    throw new GroupResolveError(
      "invalid-members",
      `"${folderLabel}" has no skill.json`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GroupResolveError(
      "invalid-members",
      `"${folderLabel}"'s skill.json is not valid JSON`,
    );
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const version = typeof obj.version === "string" ? obj.version : "0.0.0";
  const removed = obj.removed === true ? true : undefined;

  if (obj.members === undefined) {
    return { version, removed };
  }
  if (!Array.isArray(obj.members)) {
    throw new GroupResolveError(
      "invalid-members",
      `"${folderLabel}"'s skill.json "members" field must be an array`,
    );
  }
  const members = obj.members.map((entry, index) =>
    parseMemberSpec(entry, folderLabel, index),
  );
  return { version, members, removed };
}

function parseMemberSpec(
  raw: unknown,
  folderLabel: string,
  index: number,
): MemberSpec {
  if (typeof raw !== "object" || raw === null) {
    throw new GroupResolveError(
      "invalid-members",
      `"${folderLabel}"'s members[${index}] must be an object`,
    );
  }
  const entry = raw as Record<string, unknown>;

  if (entry.kind === "nested") {
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new GroupResolveError(
        "invalid-members",
        `"${folderLabel}"'s members[${index}] (kind "nested") must have a non-empty "name"`,
      );
    }
    return { kind: "nested", name: entry.name };
  }

  if (entry.kind === "pointer") {
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new GroupResolveError(
        "invalid-members",
        `"${folderLabel}"'s members[${index}] (kind "pointer") must have a non-empty "name"`,
      );
    }
    if (entry.version !== undefined && typeof entry.version !== "string") {
      throw new GroupResolveError(
        "invalid-members",
        `"${folderLabel}"'s members[${index}] "version" must be a string when present`,
      );
    }
    return {
      kind: "pointer",
      name: entry.name,
      version: entry.version as string | undefined,
    };
  }

  throw new GroupResolveError(
    "invalid-members",
    `"${folderLabel}"'s members[${index}].kind must be "nested" or "pointer"`,
  );
}

function parseSemverTriple(v: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemverTriple(a);
  const pb = parseSemverTriple(b);
  if (!pa || !pb) {
    return a.localeCompare(b);
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

// Extracts the subtree of `files` rooted at `<memberName>/`, stripping that
// prefix so paths match what a standalone fetch of that member would give.
function extractSubtree(
  files: Map<string, string>,
  memberName: string,
): Map<string, string> {
  const prefix = `${memberName}/`;
  const result = new Map<string, string>();
  for (const [path, content] of files) {
    if (path.startsWith(prefix)) {
      result.set(path.slice(prefix.length), content);
    }
  }
  return result;
}

interface WalkState {
  token: string;
  // Group names already expanded (their `members` processed) — prevents
  // infinite recursion on a group-to-group pointer cycle. Per
  // 0013-registry-group-structure-and-permanence.md: "the visited set alone
  // terminates safely on any graph shape."
  visitedGroups: Set<string>;
  // Every pin requested for a leaf skill name, in traversal order
  // (undefined entries are unpinned "latest" requests). Only populated for
  // names classified as leaf (pointer-resolved, non-group) skills.
  leafPinRequests: Map<string, Array<string | undefined>>;
  leafClassified: Set<string>;
  // First-resolved nested-member content, keyed by name — dedup gives
  // nested members priority over a same-named pointer encountered later.
  nestedSources: Map<string, { files: Map<string, string>; version: string }>;
}

async function walk(
  state: WalkState,
  members: MemberSpec[],
  groupVersion: string,
  groupFiles: Map<string, string>,
): Promise<void> {
  for (const member of members) {
    if (member.kind === "nested") {
      if (
        state.nestedSources.has(member.name) ||
        state.leafClassified.has(member.name)
      ) {
        continue; // dedup: first path to resolve a name wins
      }
      state.nestedSources.set(member.name, {
        files: extractSubtree(groupFiles, member.name),
        version: groupVersion,
      });
      continue;
    }

    // Pointer member.
    const name = member.name;
    if (state.nestedSources.has(name)) {
      continue; // a nested member already claimed this name
    }
    if (state.visitedGroups.has(name)) {
      continue; // already expanded as a group via an earlier path
    }
    if (state.leafClassified.has(name)) {
      // Already known to be a leaf skill — just record this additional pin
      // for AF-9 conflict detection; the winning version is resolved once
      // the whole graph has been walked.
      state.leafPinRequests.get(name)?.push(member.version);
      continue;
    }

    const ref = member.version ? `${name}@${member.version}` : undefined;
    const skillJsonResult = await fetchRegistryFile(
      state.token,
      `${name}/skill.json`,
      ref,
    );
    if (!skillJsonResult.ok) {
      throw new GroupResolveError(
        skillJsonResult.reason === "not-found" ? "not-found" : "unreachable",
        skillJsonResult.reason === "not-found"
          ? `"${name}" (referenced by a pointer) was not found in the registry`
          : skillJsonResult.detail,
      );
    }
    const meta = parseGroupSkillJson(skillJsonResult.content, name);

    if (meta.members) {
      state.visitedGroups.add(name);
      const groupFetch = await fetchRegistryFolder(state.token, name, ref);
      if (!groupFetch.ok) {
        throw new GroupResolveError(
          groupFetch.reason === "not-found" ? "not-found" : "unreachable",
          groupFetch.detail,
        );
      }
      await walk(state, meta.members, meta.version, groupFetch.files);
    } else {
      state.leafClassified.add(name);
      state.leafPinRequests.set(name, [member.version]);
    }
  }
}

// Resolves a top-level group's full member graph into a flat list of leaf
// skill members. `rootMembers`/`rootVersion`/`rootFiles` come from a
// caller-side fetch of the root group's own folder (already known, via its
// skill.json, to be a group).
export async function resolveGroupMembers(
  token: string,
  rootGroupName: string,
  rootVersion: string,
  rootMembers: MemberSpec[],
  rootFiles: Map<string, string>,
): Promise<GroupResolveResult> {
  const state: WalkState = {
    token,
    visitedGroups: new Set([rootGroupName]),
    leafPinRequests: new Map(),
    leafClassified: new Set(),
    nestedSources: new Map(),
  };

  try {
    await walk(state, rootMembers, rootVersion, rootFiles);
  } catch (error) {
    if (error instanceof GroupResolveError) {
      return { ok: false, reason: error.reason, detail: error.message };
    }
    throw error;
  }

  const warnings: string[] = [];
  const finalRefs = new Map<
    string,
    { ref: string | undefined; version: string | undefined }
  >();

  for (const [name, pins] of state.leafPinRequests) {
    const distinctPins = [
      ...new Set(pins.filter((p): p is string => p !== undefined)),
    ];

    if (distinctPins.length === 0) {
      finalRefs.set(name, { ref: undefined, version: undefined });
      continue;
    }
    if (distinctPins.length === 1) {
      finalRefs.set(name, {
        ref: `${name}@${distinctPins[0]}`,
        version: distinctPins[0],
      });
      continue;
    }

    const majors = new Set(distinctPins.map((v) => parseSemverTriple(v)?.[0]));
    if (majors.size > 1) {
      return {
        ok: false,
        reason: "major-conflict",
        detail: `"${name}" was reached via pointers pinned to conflicting versions across different MAJOR versions: ${distinctPins.sort().join(", ")}`,
      };
    }

    const winner = [...distinctPins].sort(compareSemver).at(-1) as string;
    warnings.push(
      `"${name}": conflicting pinned versions (${distinctPins.sort().join(", ")}) — using ${winner}.`,
    );
    finalRefs.set(name, { ref: `${name}@${winner}`, version: winner });
  }

  const resolved = new Map<string, ResolvedMember>();

  for (const [name, { files, version }] of state.nestedSources) {
    resolved.set(name, { name, version, files });
  }

  for (const [name, chosen] of finalRefs) {
    const fetchResult = await fetchRegistryFolder(token, name, chosen.ref);
    if (!fetchResult.ok) {
      return {
        ok: false,
        reason:
          fetchResult.reason === "not-found" ? "not-found" : "unreachable",
        detail: fetchResult.detail,
      };
    }
    const version =
      chosen.version ??
      parseGroupSkillJson(fetchResult.files.get("skill.json"), name).version;
    const files = new Map(fetchResult.files);
    for (const registryOnlyFile of REGISTRY_ONLY_FILES) {
      files.delete(registryOnlyFile); // registry metadata/authoring content, never deployed
    }
    resolved.set(name, { name, version, files });
  }

  return { ok: true, members: [...resolved.values()], warnings };
}
