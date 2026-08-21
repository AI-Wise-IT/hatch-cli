# @ai-wise/hatchcli

Hatch CLI — import and manage AI coding-agent skills across projects, from anywhere.

```bash
npx @ai-wise/hatchcli@latest
```

Status: `login`, `init`, `list`, `import`, `remove`, and `check-collisions` are implemented — see
`docs/use-cases/` for behavior and `docs/architecture/decisions/` for the decisions behind it.

Point Hatch at a project that already exists: `hatch init --harness claude` writes the
manifest and places the self-documentation skill, then `hatch import <name>` brings in
everything else. Hatch never creates the project directory and never runs `git init`. Git
is optional — with a repository at the project root each operation is recorded as one
commit; without one, commands do their work and say that nothing was committed.
