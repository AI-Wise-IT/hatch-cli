import { describe, expect, it } from "vitest";
import { extractFrontmatterDescription } from "./description.js";

// Builds a SKILL.md whose leading `---` block holds the given lines.
function skillMd(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "", "# Body", ""].join("\n");
}

describe("extractFrontmatterDescription — values it can read", () => {
  it("reads a plain one-line scalar", () => {
    const source = skillMd(
      "name: prd-elicitation",
      "description: Runs a structured PRD conversation.",
    );

    expect(extractFrontmatterDescription(source)).toBe(
      "Runs a structured PRD conversation.",
    );
  });

  it("reads a double-quoted value, stripping the surrounding quotes", () => {
    const source = skillMd('description: "Quoted, with a comma: and a colon."');

    expect(extractFrontmatterDescription(source)).toBe(
      "Quoted, with a comma: and a colon.",
    );
  });

  it("reads a single-quoted value, undoing YAML's doubled-quote escape", () => {
    const source = skillMd("description: 'it''s handy'");

    expect(extractFrontmatterDescription(source)).toBe("it's handy");
  });

  it("folds an escaped newline inside a double-quoted value into a space", () => {
    const source = skillMd('description: "line one\\nline two"');

    expect(extractFrontmatterDescription(source)).toBe("line one line two");
  });

  it("folds a value spanning several lines, terminated by the next top-level key", () => {
    const source = skillMd(
      "name: brainstorm",
      "description: A structured protocol for turning raw thoughts",
      "  into a clarified brainstorm, paced as a dialogue",
      "  rather than a wall of text.",
      "version: 1.0.0",
    );

    expect(extractFrontmatterDescription(source)).toBe(
      "A structured protocol for turning raw thoughts into a clarified brainstorm, paced as a dialogue rather than a wall of text.",
    );
  });

  it("stops folding at the closing fence when no further key follows", () => {
    const source = skillMd("description: first line", "  second line");

    expect(extractFrontmatterDescription(source)).toBe(
      "first line second line",
    );
  });

  it("folds a quoted value that spans lines, then strips its quotes", () => {
    const source = skillMd(
      'description: "first',
      '  second"',
      "version: 1.0.0",
    );

    expect(extractFrontmatterDescription(source)).toBe("first second");
  });

  it("reads a literal block scalar, taking the value from the following lines", () => {
    const source = skillMd(
      "description: |",
      "  Line one of the block.",
      "  Line two of the block.",
      "version: 1.0.0",
    );

    expect(extractFrontmatterDescription(source)).toBe(
      "Line one of the block. Line two of the block.",
    );
  });

  it("reads a folded block scalar", () => {
    const source = skillMd(
      "description: >",
      "  Folded across",
      "  two lines.",
      "name: thing",
    );

    expect(extractFrontmatterDescription(source)).toBe(
      "Folded across two lines.",
    );
  });

  it("reads a block scalar carrying chomping and indent indicators", () => {
    for (const indicator of ["|-", "|+", ">-", ">+", "|2", ">2-"]) {
      const source = skillMd(
        `description: ${indicator}`,
        "  Indicator-carrying block.",
        "version: 1.0.0",
      );

      expect(extractFrontmatterDescription(source)).toBe(
        "Indicator-carrying block.",
      );
    }
  });

  it("collapses runs of whitespace and blank lines into single spaces", () => {
    const source = skillMd(
      "description: spaced    out",
      "",
      "  and    continued",
      "version: 1.0.0",
    );

    expect(extractFrontmatterDescription(source)).toBe(
      "spaced out and continued",
    );
  });

  it("reads the block after leading blank lines, and through CRLF line endings", () => {
    const source = "\r\n---\r\nname: x\r\ndescription: CRLF value\r\n---\r\n";

    expect(extractFrontmatterDescription(source)).toBe("CRLF value");
  });

  it("reads a block opened behind a byte-order mark", () => {
    const source = "\uFEFF---\nname: x\ndescription: BOM value\n---\n";

    expect(extractFrontmatterDescription(source)).toBe("BOM value");
  });
});

describe("extractFrontmatterDescription — unreadable cases yield no description", () => {
  it("returns undefined for no source at all", () => {
    expect(extractFrontmatterDescription(undefined)).toBeUndefined();
    expect(extractFrontmatterDescription("")).toBeUndefined();
  });

  it("returns undefined for a file with no frontmatter", () => {
    expect(
      extractFrontmatterDescription(
        "# A skill\n\ndescription: not frontmatter\n",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for a `---` that does not lead the file", () => {
    const source = "# A skill\n\n---\ndescription: below a rule\n---\n";

    expect(extractFrontmatterDescription(source)).toBeUndefined();
  });

  it("returns undefined for frontmatter with no description key", () => {
    expect(
      extractFrontmatterDescription(skillMd("name: x", "version: 1.0.0")),
    ).toBeUndefined();
  });

  it("returns undefined for a description nested under another key", () => {
    const source = skillMd("metadata:", "  description: nested value");

    expect(extractFrontmatterDescription(source)).toBeUndefined();
  });

  it("returns undefined for an empty value", () => {
    expect(
      extractFrontmatterDescription(skillMd("description:")),
    ).toBeUndefined();
  });

  it("returns undefined for a whitespace-only value", () => {
    expect(
      extractFrontmatterDescription(
        skillMd("description:    ", "version: 1.0.0"),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an empty quoted value", () => {
    expect(
      extractFrontmatterDescription(
        skillMd('description: ""', "version: 1.0.0"),
      ),
    ).toBeUndefined();
    expect(
      extractFrontmatterDescription(
        skillMd("description: '   '", "version: 1.0.0"),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an unterminated fence", () => {
    const source = "---\nname: x\ndescription: never closed\n\n# Body\n";

    expect(extractFrontmatterDescription(source)).toBeUndefined();
  });

  it("leaves an unbalanced quote alone rather than guessing at it", () => {
    const source = skillMd('description: "unterminated', "version: 1.0.0");

    expect(extractFrontmatterDescription(source)).toBe('"unterminated');
  });

  it("raises on nothing it cannot make sense of", () => {
    const nonsense = [
      undefined,
      "",
      "---",
      "---\n",
      "---\n---\n",
      "---\ndescription\n---\n",
      "------\ndescription: x\n---\n",
      "\n\n\n",
      "---\n:\n---\n",
      "---\ndescription: |\n---\n",
    ];

    for (const source of nonsense) {
      expect(() => extractFrontmatterDescription(source)).not.toThrow();
    }
  });
});
