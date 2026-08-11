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

function contentsUrl(path: string): string {
  return `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${path}`;
}

async function getContents(
  token: string,
  path: string,
): Promise<ContentsResponse> {
  let response: Response;
  try {
    response = await fetch(contentsUrl(path), {
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

// Fetches every file under `folderName` (recursing into subdirectories),
// returning each file's content keyed by its path relative to that folder.
export async function fetchRegistryFolder(
  token: string,
  folderName: string,
): Promise<RegistryFetchResult> {
  const files = new Map<string, string>();
  const queue: string[] = [folderName];

  while (queue.length > 0) {
    const path = queue.shift() as string;
    const result = await getContents(token, path);

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

      const fileResult = await getContents(token, entry.path);
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
