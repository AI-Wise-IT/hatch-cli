// Registry content fetch (ADR-0003): fetches a named skill/group
// subdirectory from the private hatch-skills repo via GitHub's contents
// API, extracting only that subtree. Never a full git clone; nothing is
// cached to disk beyond the files placed by the current operation.

const REGISTRY_OWNER = "AI-Wise-IT";
const REGISTRY_REPO = "hatch-skills";

export interface RegistryFetchOk {
  ok: true;
  // Path relative to the fetched folder -> its utf8 content.
  files: Map<string, string>;
}

export interface RegistryFetchFailure {
  ok: false;
  reason: "not-found" | "unreachable";
  detail: string;
}

export type RegistryFetchResult = RegistryFetchOk | RegistryFetchFailure;

interface ContentsEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  content?: string;
  encoding?: string;
}

type ContentsResponse =
  | { kind: "ok"; status: 200; body: ContentsEntry | ContentsEntry[] }
  | { kind: "not-found" }
  | { kind: "network-error"; message: string }
  | { kind: "unexpected-status"; status: number };

function contentsUrl(path: string, ref?: string): string {
  const base = `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${path}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

async function getContents(
  token: string,
  path: string,
  ref?: string,
): Promise<ContentsResponse> {
  let response: Response;
  try {
    response = await fetch(contentsUrl(path, ref), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "hatchcli",
      },
    });
  } catch (error) {
    return {
      kind: "network-error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status === 404) {
    return { kind: "not-found" };
  }
  if (response.status !== 200) {
    return { kind: "unexpected-status", status: response.status };
  }

  const body = (await response.json()) as ContentsEntry | ContentsEntry[];
  return { kind: "ok", status: 200, body };
}

function decodeFile(entry: ContentsEntry): string {
  const encoding = (entry.encoding ?? "base64") as BufferEncoding;
  return Buffer.from(entry.content ?? "", encoding).toString("utf8");
}

export interface RegistryVersionsOk {
  ok: true;
  // Every version published for the queried name, in the order GitHub
  // returned its tags — callers order these themselves.
  versions: string[];
}

export type RegistryVersionsResult = RegistryVersionsOk | RegistryFetchFailure;

interface GitRef {
  ref: string;
}

const REFS_PAGE_SIZE = 100;

// Every `<name>@<version>` tag published for one skill or group
// (0009-skill-versioning-semver-tags.md), used to resolve a group pointer's
// caret constraint to a concrete version.
//
// Matched by prefix rather than by listing the repository's tags and
// filtering here: the registry accumulates one tag per version per folder
// forever, so a full listing would make resolving one member cost a walk of
// every release the registry has ever cut. The trailing "@" in the prefix
// is what keeps a query for "brand" from also matching "brand-assets@1.0.0".
export async function fetchPublishedVersions(
  token: string,
  name: string,
): Promise<RegistryVersionsResult> {
  const prefix = `${name}@`;
  const versions: string[] = [];

  for (let page = 1; ; page++) {
    const url =
      `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}` +
      `/git/matching-refs/tags/${encodeURIComponent(prefix)}` +
      `?per_page=${REFS_PAGE_SIZE}&page=${page}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "hatchcli",
        },
      });
    } catch (error) {
      return {
        ok: false,
        reason: "unreachable",
        detail: `could not reach the registry (${error instanceof Error ? error.message : String(error)})`,
      };
    }

    // A prefix matching no tag yields an empty array, not a 404 — but the
    // endpoint does 404 when the repository itself is unreachable to this
    // token, which is not the same thing as "this name has no releases".
    if (response.status === 404) {
      return {
        ok: false,
        reason: "not-found",
        detail: `the registry has no tag namespace for "${name}"`,
      };
    }
    if (response.status !== 200) {
      return {
        ok: false,
        reason: "unreachable",
        detail: `the registry responded with an unexpected status (${response.status})`,
      };
    }

    const body = (await response.json()) as GitRef[];
    for (const entry of body) {
      const tag = entry.ref.replace(/^refs\/tags\//, "");
      if (tag.startsWith(prefix)) {
        versions.push(tag.slice(prefix.length));
      }
    }

    if (body.length < REFS_PAGE_SIZE) {
      return { ok: true, versions };
    }
  }
}

export interface RegistryFolderExistsOk {
  ok: true;
  exists: boolean;
}

export interface RegistryFolderExistsFailure {
  ok: false;
  reason: "unreachable";
  detail: string;
}

export type RegistryFolderExistsResult =
  | RegistryFolderExistsOk
  | RegistryFolderExistsFailure;

// A single, non-recursive contents-API call checking whether a top-level
// registry folder exists — used to resolve harness-suffixed vs. plain skill
// folder names (see harness-registry.ts's resolveSkillFolderName) without
// paying for a full recursive fetch just to find out.
export async function registryFolderExists(
  token: string,
  folderName: string,
): Promise<RegistryFolderExistsResult> {
  const result = await getContents(token, folderName);

  if (result.kind === "network-error") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `could not reach the registry (${result.message})`,
    };
  }
  if (result.kind === "unexpected-status") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `the registry responded with an unexpected status (${result.status})`,
    };
  }

  return { ok: true, exists: result.kind === "ok" };
}

export interface RegistryRootEntry {
  name: string;
  type: ContentsEntry["type"];
}

export interface RegistryRootListingOk {
  ok: true;
  entries: RegistryRootEntry[];
}

export interface RegistryRootListingFailure {
  ok: false;
  // "no-registry-access" is deliberately *not* the "not-found" reason a
  // named folder's 404 carries. On a named folder a 404 is genuinely
  // ambiguous between "no such name" and "this credential cannot see the
  // registry" — the ambiguity `hatch import`'s wording depends on
  // (0027-testing-skill-convention.md). On the repository root it is not
  // ambiguous at all: the root exists for anyone who can see the
  // repository, so the only reading is a credential without access.
  reason: "unreachable" | "no-registry-access";
  detail: string;
}

export type RegistryRootListingResult =
  | RegistryRootListingOk
  | RegistryRootListingFailure;

// A single, non-recursive contents-API call over the registry root, giving
// every top-level entry's name and type — the one call shape `hatch list`
// (UC-6) needs, and the only one that enumerates the registry rather than
// asking about a name already known. Contents on a directory returns names
// and types without file contents, so per-entry metadata still costs a call
// each; this is the enumeration step, not a batched fetch.
export async function listRegistryRoot(
  token: string,
): Promise<RegistryRootListingResult> {
  const result = await getContents(token, "");

  if (result.kind === "network-error") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `could not reach the registry (${result.message})`,
    };
  }
  if (result.kind === "not-found") {
    return {
      ok: false,
      reason: "no-registry-access",
      detail: "the registry root could not be read with these credentials",
    };
  }
  if (result.kind === "unexpected-status") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `the registry responded with an unexpected status (${result.status})`,
    };
  }

  const entries = Array.isArray(result.body) ? result.body : [result.body];
  return {
    ok: true,
    entries: entries.map((entry) => ({ name: entry.name, type: entry.type })),
  };
}

export interface RegistryFileOk {
  ok: true;
  content: string;
}

export type RegistryFileResult = RegistryFileOk | RegistryFetchFailure;

// Fetches a single file's content — used to inspect a candidate registry
// folder's own skill.json (e.g. to classify it as a group vs. a plain
// skill, per 0016-group-member-manifest-format.md) without paying for a
// full recursive fetch of content that might not even be needed.
export async function fetchRegistryFile(
  token: string,
  path: string,
  ref?: string,
): Promise<RegistryFileResult> {
  const result = await getContents(token, path, ref);

  if (result.kind === "network-error") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `could not reach the registry (${result.message})`,
    };
  }
  if (result.kind === "not-found") {
    return {
      ok: false,
      reason: "not-found",
      detail: `"${path}" was not found in the registry`,
    };
  }
  if (result.kind === "unexpected-status") {
    return {
      ok: false,
      reason: "unreachable",
      detail: `the registry responded with an unexpected status (${result.status})`,
    };
  }

  const entry = Array.isArray(result.body) ? result.body[0] : result.body;
  return { ok: true, content: decodeFile(entry) };
}

// Fetches every file under `folderName` (recursing into subdirectories),
// returning each file's content keyed by its path relative to that folder.
// `ref` resolves a specific historical version via the `<name>@<version>`
// tag mechanism (0009-skill-versioning-semver-tags.md); omitted means
// latest (`main`).
export async function fetchRegistryFolder(
  token: string,
  folderName: string,
  ref?: string,
): Promise<RegistryFetchResult> {
  const files = new Map<string, string>();
  const queue: string[] = [folderName];

  while (queue.length > 0) {
    const path = queue.shift() as string;
    const result = await getContents(token, path, ref);

    if (result.kind === "network-error") {
      return {
        ok: false,
        reason: "unreachable",
        detail: `could not reach the registry (${result.message})`,
      };
    }
    if (result.kind === "not-found") {
      return {
        ok: false,
        reason: "not-found",
        detail: `"${folderName}" was not found in the registry`,
      };
    }
    if (result.kind === "unexpected-status") {
      return {
        ok: false,
        reason: "unreachable",
        detail: `the registry responded with an unexpected status (${result.status})`,
      };
    }

    const entries = Array.isArray(result.body) ? result.body : [result.body];
    for (const entry of entries) {
      if (entry.type === "dir") {
        queue.push(entry.path);
        continue;
      }
      if (entry.type !== "file") {
        continue;
      }

      const fileResult = await getContents(token, entry.path, ref);
      if (fileResult.kind === "network-error") {
        return {
          ok: false,
          reason: "unreachable",
          detail: `could not reach the registry (${fileResult.message})`,
        };
      }
      if (fileResult.kind === "not-found") {
        return {
          ok: false,
          reason: "unreachable",
          detail: `"${entry.path}" disappeared from the registry mid-fetch`,
        };
      }
      if (fileResult.kind === "unexpected-status") {
        return {
          ok: false,
          reason: "unreachable",
          detail: `the registry responded with an unexpected status (${fileResult.status})`,
        };
      }

      const fileEntry = Array.isArray(fileResult.body)
        ? fileResult.body[0]
        : fileResult.body;
      const relativePath = entry.path.slice(folderName.length + 1);
      files.set(relativePath, decodeFile(fileEntry));
    }
  }

  return { ok: true, files };
}
