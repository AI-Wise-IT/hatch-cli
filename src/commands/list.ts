// `hatch list` (UC-6): prints the skills and groups the registry holds and
// `hatch import` will accept, optionally narrowed by a name filter. It is a
// registry query, not a project operation — it places no content, writes no
// manifest and makes no commit, and it runs from any directory, with or
// without a manifest.
//
// The retrieval is a live walk, not an index: one non-recursive Contents
// call over the registry root, then one `skill.json` per surviving
// candidate and one `SKILL.md` per surviving plain skill, run through a
// bounded pool. An index at the registry root would be faster and is the
// recorded escape hatch if registry growth ever makes this bite — it is
// deliberately not built, for the same reason ADR-0009 rejected a version
// index and 0019-registry-removed-metadata-flag.md rejected a removed-names
// index: a second artifact that must always agree with the tree it
// describes.
//
// Ordering matters to cost and to what is hidden. Names come from the root
// call, so the user's filter and the `_`-prefix testing exclusion
// (0027-testing-skill-convention.md) both run before any per-entry fetch —
// a filtered run pays for its matches only. The `removed`
// (0019-registry-removed-metadata-flag.md) and declared-`testing`
// exclusions need a `skill.json`, so they necessarily drop an entry from
// the rendered output rather than from the fetch set.
//
// Harness variants fold into the family name only when the plain folder
// exists (0001-harness-suffix-convention.md,
// 0025-harness-shadowing-risk-accepted.md): that is exactly the case
// `resolveSkillFolderName` would resolve to the variant, and the only case
// decidable from one snapshot. Every other name is printed literally,
// because a lone `<base>-<code>` is indistinguishable from an ordinary
// skill ending in a reserved code — and its literal name does resolve.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { authenticate } from "../auth/authenticate.js";
import { reservedHarnessCodes } from "../harness-registry.js";
import { migrateManifest } from "../manifest-migrations/index.js";
import { isTestProject } from "../project/test-project.js";
import { extractFrontmatterDescription } from "../registry/description.js";
import {
  type RegistryRootEntry,
  fetchRegistryFile,
  listRegistryRoot,
} from "../registry/fetch.js";
import { parseGroupSkillJson } from "../registry/group-resolve.js";
import { isTestingSkillName } from "../registry/testing-skill.js";

// Roughly two calls per entry against a 5,000/hour authenticated limit at a
// registry of fifteen top-level folders — small enough that the pool exists
// to keep the walk concurrent rather than to protect the API.
const FETCH_CONCURRENCY = 8;

const USAGE = "usage: hatch list [filter]";

// What a rendered row shows. `description` absent is an ordinary listable
// state, never an error: every version published before the field was
// required carries none, and those versions stay reachable forever.
export interface ListEntry {
  name: string;
  kind: "skill" | "group";
  version: string;
  description?: string;
}

export interface ParsedListArgs {
  filter: string | undefined;
}

// The optional single filter argument. A second positional is rejected
// rather than silently ignored — two terms would otherwise look like they
// narrowed twice.
export function parseListArgs(
  argv: string[],
): ParsedListArgs | { error: string } {
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      return { error: `unrecognized option "${arg}"` };
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    return { error: `unexpected extra argument "${positional[1]}"` };
  }

  return { filter: positional[0] };
}

// Root entries -> the names that could be listed, before any metadata is
// known. Non-directories are dropped (registry content is always a
// folder), and `<base>-<code>` collapses into `<base>` only when a
// top-level `<base>` also exists. Pure and synchronous: the reserved codes
// are injectable so this stays decidable without the harness registry file,
// and the default reads them from it rather than restating `cld`/`cdx`.
export function foldCandidateNames(
  entries: RegistryRootEntry[],
  codes: string[] = reservedHarnessCodes(),
): string[] {
  const folderNames = entries
    .filter((entry) => entry.type === "dir")
    .map((entry) => entry.name);
  const present = new Set(folderNames);

  const candidates: string[] = [];
  for (const name of folderNames) {
    const foldsInto = codes
      .map((code) =>
        name.endsWith(`-${code}`)
          ? name.slice(0, -(code.length + 1))
          : undefined,
      )
      .find((base) => base !== undefined && base !== "" && present.has(base));
    if (foldsInto !== undefined) {
      continue; // the plain sibling is the name `hatch import` resolves
    }
    if (!candidates.includes(name)) {
      candidates.push(name);
    }
  }

  return candidates;
}

// The two name-only exclusions, applied together because both are decidable
// from the root listing alone and so both run before any fetch. The filter
// matches names only — never descriptions, versions or kinds — as a
// case-insensitive substring.
export function filterCandidateNames(
  names: string[],
  filter: string | undefined,
  allowTesting: boolean,
): string[] {
  const needle = filter?.toLowerCase();
  return names.filter((name) => {
    if (!allowTesting && isTestingSkillName(name)) {
      return false;
    }
    return needle === undefined || name.toLowerCase().includes(needle);
  });
}

// Entries -> the lines printed, sorted ascending by name so the ordering
// never depends on the order the registry returned them. Compared by code
// unit rather than by locale, so the same registry renders identically
// wherever it is run.
export function renderListing(entries: ListEntry[]): string[] {
  const sorted = [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const nameWidth = Math.max(0, ...sorted.map((entry) => entry.name.length));
  const kindWidth = Math.max(0, ...sorted.map((entry) => entry.kind.length));
  const versions = new Map(
    sorted.map((entry) => [entry.name, `v${entry.version}`]),
  );
  const versionWidth = Math.max(
    0,
    ...[...versions.values()].map((version) => version.length),
  );

  return sorted.map((entry) => {
    // Collapsed to one physical line: a listing prints one entry per line,
    // and a description authored across several lines would otherwise
    // break that. An absent one is named as absent rather than left blank,
    // so a row is never ambiguous between "no description" and a
    // formatting accident.
    const description = entry.description
      ? entry.description.replace(/\s+/g, " ").trim()
      : "(no description)";
    return `${entry.name.padEnd(nameWidth)}  ${entry.kind.padEnd(kindWidth)}  ${(
      versions.get(entry.name) as string
    ).padEnd(versionWidth)}  ${description}`;
  });
}

// Runs `worker` over `items` with at most `limit` in flight, preserving
// input order in the results. A handful of independent single-file fetches
// is all this ever runs, so it stays a local helper rather than a
// dependency.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

// What one candidate's metadata fetch resolved to.
type CandidateOutcome =
  // Listed.
  | { kind: "entry"; entry: ListEntry }
  // Not registry content at all, or content deliberately withheld — both
  // leave no trace in the output.
  | { kind: "omitted" }
  // Readable root, unreadable entry: named in the report, and the reason
  // the command exits non-zero with an otherwise complete listing.
  | { kind: "unreadable"; name: string; detail: string };

async function readCandidate(
  token: string,
  name: string,
  allowTesting: boolean,
): Promise<CandidateOutcome> {
  const skillJson = await fetchRegistryFile(token, `${name}/skill.json`);

  if (!skillJson.ok) {
    // A 404 on `<name>/skill.json` says this top-level folder is not
    // registry content — a docs or workflow directory sitting beside the
    // skills. That is not a failure to read something that should be
    // there, so it drops out silently, unlike the unreachable case below.
    if (skillJson.reason === "not-found") {
      return { kind: "omitted" };
    }
    return { kind: "unreadable", name, detail: skillJson.detail };
  }

  let meta: ReturnType<typeof parseGroupSkillJson>;
  try {
    meta = parseGroupSkillJson(skillJson.content, name);
  } catch (error) {
    // Unreadable metadata means kind, version and removed-status are all
    // unknown, so the entry cannot be rendered honestly at all.
    return {
      kind: "unreadable",
      name,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 0019/0021: a removed entry is a dead end — a first-time import of one
  // is refused outright, so listing it would advertise something that
  // cannot be imported.
  if (meta.removed) {
    return { kind: "omitted" };
  }
  // 0027's declaration backstop, for content that reached the registry
  // without the reserved prefix the name check above keys off.
  if (!allowTesting && meta.testing === true) {
    return { kind: "omitted" };
  }

  if (meta.members) {
    // A group's description comes from its own manifest and its SKILL.md is
    // never fetched — it has none. Deriving one from its members would
    // describe the parts rather than the whole.
    return {
      kind: "entry",
      entry: {
        name,
        kind: "group",
        version: meta.version,
        description: meta.description,
      },
    };
  }

  // A plain skill's description is read from its SKILL.md frontmatter and
  // never from its skill.json — the frontmatter is the copy that governs
  // how the skill behaves once placed.
  const skillMd = await fetchRegistryFile(token, `${name}/SKILL.md`);

  // A 404 and a transport failure are not the same fact. A 404 says the
  // file is not there, so the description really is absent — one of the
  // ordinary listable states, alongside no frontmatter and no description
  // key. A rate limit, a network error or an unexpected status says only
  // that we could not read it: the skill may well carry a description.
  // Printing "(no description)" for those and exiting 0 would misdescribe
  // a real entry with no way for the reader to tell — precisely the
  // incomplete-listing-mistaken-for-complete failure the per-entry read
  // failure path exists to prevent.
  if (!skillMd.ok && skillMd.reason !== "not-found") {
    return { kind: "unreadable", name, detail: skillMd.detail };
  }

  return {
    kind: "entry",
    entry: {
      name,
      kind: "skill",
      version: meta.version,
      description: skillMd.ok
        ? extractFrontmatterDescription(skillMd.content)
        : undefined,
    },
  };
}

// 0027's opt-in, read from the manifest of the directory the command runs
// in. `hatch list` needs no project, so an absent — or unreadable —
// manifest is an ordinary project rather than an error: it must never
// report a missing manifest or name `hatch init`.
function readTestProjectOptIn(cwd: string): boolean {
  const manifestPath = join(cwd, "hatch.manifest.json");
  if (!existsSync(manifestPath)) {
    return false;
  }
  try {
    return isTestProject(
      migrateManifest(JSON.parse(readFileSync(manifestPath, "utf8"))),
    );
  } catch {
    return false;
  }
}

export async function runList(argv: string[]): Promise<number> {
  const parsed = parseListArgs(argv);
  if ("error" in parsed) {
    console.error(`hatch list: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }

  const allowTesting = readTestProjectOptIn(process.cwd());

  // UC-6: authenticate before reading anything — the registry is private,
  // and an invalid password aborts here, before a single registry call.
  const authResult = await authenticate();
  if ("error" in authResult) {
    console.error(`hatch list: ${authResult.error}`);
    return 1;
  }
  const token = authResult.token;

  const root = await listRegistryRoot(token);
  if (!root.ok) {
    // A 404 on the root is not a missing name: the root exists for anyone
    // who can see the repository, so the only reading is a credential
    // without registry access. `hatch import`'s per-name "not found"
    // wording is a different call and stays exactly as it is.
    console.error(
      root.reason === "no-registry-access"
        ? "hatch list: these credentials do not grant access to the registry — check that the token can read the registry repository."
        : `hatch list: registry unreachable (${root.detail}).`,
    );
    return 1;
  }

  const candidates = filterCandidateNames(
    foldCandidateNames(root.entries),
    parsed.filter,
    allowTesting,
  );

  const outcomes = await mapWithConcurrency(
    candidates,
    FETCH_CONCURRENCY,
    (name) => readCandidate(token, name, allowTesting),
  );

  const entries: ListEntry[] = [];
  const unreadable: Array<{ name: string; detail: string }> = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "entry") {
      entries.push(outcome.entry);
    } else if (outcome.kind === "unreadable") {
      unreadable.push({ name: outcome.name, detail: outcome.detail });
    }
  }

  if (entries.length === 0 && unreadable.length === 0) {
    // A query with no results is not a failure. The wording is the same
    // whether the registry is empty, the filter matched nothing, or the
    // filter named testing content this project cannot see — a project
    // without the opt-in must not be able to tell those apart, so nothing
    // here counts, hints at, or names what was withheld.
    console.log(
      parsed.filter === undefined
        ? "hatch list: the registry has nothing to list."
        : `hatch list: nothing matches "${parsed.filter}".`,
    );
    return 0;
  }

  for (const line of renderListing(entries)) {
    console.log(line);
  }

  if (unreadable.length > 0) {
    // Everything readable is printed, the rest are named, and the exit
    // status is non-zero — an incomplete listing must never be mistaken
    // for a complete one. Same shape `hatch check-collisions` uses.
    console.error(
      `hatch list: could not read ${unreadable.length} entr${unreadable.length === 1 ? "y" : "ies"} — this listing is incomplete.`,
    );
    for (const { name, detail } of unreadable) {
      console.error(`  "${name}": ${detail}`);
    }
    return 1;
  }

  return 0;
}
