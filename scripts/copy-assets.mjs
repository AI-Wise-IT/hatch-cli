// tsc only emits .ts -> .js; non-TS assets the compiled CLI reads at
// runtime (src/harness-registry.json) must be copied into dist/ manually
// as part of the build, mirroring the same sibling-file layout.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = ["src/harness-registry.json"];

for (const relativePath of assets) {
  const from = join(root, relativePath);
  const to = join(root, "dist", relativePath.slice("src/".length));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
