// A skill's own description, read from its SKILL.md frontmatter (UC-6).
//
// A plain skill's description already exists in the `description` field
// every harness reads out of the leading `---` block, so that block is the
// single source: copying it into skill.json would create two authored
// copies of one sentence with nothing checking they agree, and the
// frontmatter is the copy that governs how the skill actually behaves once
// placed. A group has no SKILL.md of its own and carries its description on
// its skill.json instead — see group-resolve.ts.
//
// The reader here is deliberately narrow rather than a YAML dependency: the
// target is one known key in a block authored to a fixed convention, and
// the worst outcome of mis-reading an unusual file is no description at
// all, which `hatch list` treats as an ordinary listable state rather than
// an error. Nothing here throws, for the same reason — an entry's name,
// kind and version never depend on it.

const FENCE = "---";

// A top-level key line inside the frontmatter block: an unindented
// `<key>:`. This is what terminates a value that spans several lines.
const KEY_LINE = /^[A-Za-z0-9_.$-]+[ \t]*:/;

const DESCRIPTION_LINE = /^description[ \t]*:(.*)$/;

// A block scalar indicator (`|`, `>`, with any chomping/indent indicator):
// the value starts on the following lines, not on the key's own line.
const BLOCK_SCALAR = /^[ \t]*[|>][+\-0-9]*[ \t]*$/;

// Extracts the `description` from a SKILL.md's leading frontmatter block.
// Returns undefined for every case the reader cannot make sense of: no
// file at all, no frontmatter, an unterminated fence, no `description`
// key, or a value that reads as empty.
export function extractFrontmatterDescription(
  source: string | undefined,
): string | undefined {
  if (!source) {
    return undefined;
  }

  const lines = source.split(/\r?\n/);

  // The block has to lead the file — a `---` further down is a horizontal
  // rule or a section break, not frontmatter. (A leading byte-order mark
  // is whitespace to trim(), so a BOM'd file still opens cleanly here.)
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") {
    start++;
  }
  if (start >= lines.length || lines[start].trim() !== FENCE) {
    return undefined;
  }

  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return undefined; // unterminated fence: not a frontmatter block
  }

  const block = lines.slice(start + 1, end);

  const keyIndex = block.findIndex((line) => DESCRIPTION_LINE.test(line));
  if (keyIndex === -1) {
    return undefined;
  }

  const onKeyLine = (
    DESCRIPTION_LINE.exec(block[keyIndex]) as RegExpExecArray
  )[1];
  const parts: string[] = [];
  if (!BLOCK_SCALAR.test(onKeyLine) && onKeyLine.trim() !== "") {
    parts.push(onKeyLine.trim());
  }

  // Continuation lines: everything up to the next top-level key or the
  // closing fence. Folded into one line — a listing prints one entry per
  // line, so a value's own line breaks are whitespace here.
  for (let i = keyIndex + 1; i < block.length; i++) {
    const line = block[i];
    if (KEY_LINE.test(line)) {
      break;
    }
    if (line.trim() === "") {
      continue;
    }
    parts.push(line.trim());
  }

  return normalize(unquote(parts.join(" ")));
}

// Strips one layer of surrounding quotes, undoing only the escapes YAML's
// quoted styles actually require. An unbalanced quote is left alone rather
// than guessed at.
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (first === '"' && last === '"') {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (first === "'" && last === "'") {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

// Collapses whatever survived into a single readable line, and reports an
// empty or whitespace-only value as no description at all.
function normalize(value: string): string | undefined {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed === "" ? undefined : collapsed;
}
