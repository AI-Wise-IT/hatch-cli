#!/usr/bin/env node

const [, , command] = process.argv;

if (!command) {
  console.log(
    "hatchcli 0.0.0 — infrastructure skeleton, no product commands implemented yet.",
  );
  process.exit(0);
}

console.error(
  `hatchcli: unknown command "${command}" — no product commands implemented yet.`,
);
process.exit(1);
