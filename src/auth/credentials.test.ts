import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testHome: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => testHome,
  };
});

const { resolveToken, writeCredentials } = await import("./credentials.js");

describe("credentials", () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "hatch-credentials-test-"));
    Reflect.deleteProperty(process.env, "HATCH_TOKEN");
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, "HATCH_TOKEN");
    rmSync(testHome, { recursive: true, force: true });
  });

  it("resolves undefined when neither env var nor file is present", () => {
    expect(resolveToken()).toBeUndefined();
  });

  it("resolves the token from the credentials file when written", () => {
    writeCredentials("file-token");
    expect(resolveToken()).toBe("file-token");
  });

  it("prefers HATCH_TOKEN over a stored file credential", () => {
    writeCredentials("file-token");
    process.env.HATCH_TOKEN = "env-token";
    expect(resolveToken()).toBe("env-token");
  });

  it("writes the credentials file under the home directory, never a project path", () => {
    writeCredentials("a-token");
    const path = join(testHome, ".hatch", "credentials.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      token: "a-token",
    });
  });

  it.skipIf(process.platform === "win32")(
    "writes the credentials file with restrictive permissions",
    () => {
      writeCredentials("a-token");
      const path = join(testHome, ".hatch", "credentials.json");
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    },
  );

  it("does not create or modify the credentials file when writeCredentials is never called", () => {
    const path = join(testHome, ".hatch", "credentials.json");
    expect(existsSync(path)).toBe(false);
  });
});
