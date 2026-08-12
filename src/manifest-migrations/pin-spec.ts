// Standalone version-pin argument parsing
// (0020-standalone-version-pin-manifest-and-parsing.md): `<name>@<spec>`
// splits on the LAST "@" in the positional argument (registry names never
// contain "@" themselves, so this is unambiguous, and matches how scoped
// npm package names are parsed).

export type PinSpec =
  | { kind: "none" }
  | { kind: "latest" }
  | { kind: "exact"; value: string }
  | { kind: "range"; value: string };

export interface ImportTarget {
  name: string;
  spec: PinSpec;
}

export function parseImportTarget(arg: string): ImportTarget {
  const at = arg.lastIndexOf("@");
  if (at <= 0) {
    // No "@" (or a leading "@" with nothing before it — not a valid name)
    // — the whole argument is the name, unpinned.
    return { name: arg, spec: { kind: "none" } };
  }
  const name = arg.slice(0, at);
  const raw = arg.slice(at + 1);
  if (raw === "latest") {
    return { name, spec: { kind: "latest" } };
  }
  if (raw.startsWith("^")) {
    return { name, spec: { kind: "range", value: raw.slice(1) } };
  }
  return { name, spec: { kind: "exact", value: raw } };
}

export interface Pin {
  type: "exact" | "range";
  value: string;
}

// Given a spec parsed from this run's argument and whatever pin (if any)
// was already recorded, resolves what the manifest's `pin` field should be
// after this run: `latest` clears it, `exact`/`range` overwrite it,
// `none` (a bare re-import) leaves it exactly as it was.
export function resolvePin(
  spec: PinSpec,
  existingPin: Pin | undefined,
): Pin | undefined {
  if (spec.kind === "exact") {
    return { type: "exact", value: spec.value };
  }
  if (spec.kind === "range") {
    return { type: "range", value: spec.value };
  }
  if (spec.kind === "latest") {
    return undefined;
  }
  return existingPin;
}

export function pinsEqual(a: Pin | undefined, b: Pin | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.type === b.type && a.value === b.value;
}
