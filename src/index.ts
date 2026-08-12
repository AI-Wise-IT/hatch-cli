#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runImport } from "./commands/import.js";
import { runLogin } from "./commands/login.js";
import { runNew } from "./commands/new.js";
import { runRemove } from "./commands/remove.js";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
);

const [, , command, ...rest] = process.argv;

if (!command) {
  console.log(`hatchcli ${version}`);
} else if (command === "login") {
  process.exitCode = await runLogin();
} else if (command === "new") {
  process.exitCode = await runNew(rest);
} else if (command === "import") {
  process.exitCode = await runImport(rest);
} else if (command === "remove") {
  process.exitCode = await runRemove(rest);
} else {
  console.error(`hatchcli: unknown command "${command}".`);
  process.exitCode = 1;
}
