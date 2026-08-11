#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLogin } from "./commands/login.js";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
);

const [, , command] = process.argv;

if (!command) {
  console.log(`hatchcli ${version}`);
} else if (command === "login") {
  process.exitCode = await runLogin();
} else {
  console.error(`hatchcli: unknown command "${command}".`);
  process.exitCode = 1;
}
