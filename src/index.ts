#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
);

const [, , command] = process.argv;

if (!command) {
  console.log(
    `hatchcli ${version} — infrastructure skeleton, no product commands implemented yet.`,
  );
  process.exit(0);
}

console.error(
  `hatchcli: unknown command "${command}" — no product commands implemented yet.`,
);
process.exit(1);
