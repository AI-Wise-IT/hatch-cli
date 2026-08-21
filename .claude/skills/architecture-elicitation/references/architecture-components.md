# Architecture Components

A reference menu of candidate architecture components — not exhaustive, not mandatory. No entry here is automatically in scope; the project may need something not listed, and finding that is this skill's job. Kept for the life of the project: a later requirement may need to reselect from it.

Each entry states what it covers, the question that decides whether it applies, what it produces, what it grounds on, and its ownership boundary against its neighbours.

---

## Frontend

Covers the user-facing layer: the framework or rendering approach, the component model, routing, and client-side state management — wherever the application presents an interface to a user.

**Deciding question:** Does the project present a user interface?

**Produces:** `frontend.md`, or a confirmed project-specific output name when the shape needs one.

**Grounds on:** The functional requirements and use cases, and the kind of interface they imply. Mutually interdependent with *Backend* and *Data* — their options co-vary, so they're normally decided together as one foundational-stack conversation.

**Owns:** The frontend framework or rendering approach; component model; routing; client-side state management; environment variables the frontend reads at build or runtime.

**Does not own:** API and server logic (→ *Backend*); persistence (→ *Data*).

**Note:** Skip with a citation for projects with no user interface (a library, a CLI tool, a headless service, an MCP server with no UI of its own).

---

## Backend

Covers the server-side layer: the language and framework, the interface consumed only by the project's own frontend or internal clients, and the server-side execution model.

**Deciding question:** Does the project have server-side or application logic beyond the client?

**Produces:** `backend.md`, or a confirmed project-specific output name such as `integration.md` for a library's public interface.

**Grounds on:** The functional requirements and use cases. Mutually interdependent with *Frontend* and *Data* — decided together as the foundational stack.

**Owns:** The backend language and framework; the server-side execution model; the interface consumed only by the project's own frontend or internal clients; environment variables the backend reads at runtime.

**Does not own:** The user-facing layer (→ *Frontend*); persistence and the data model (→ *Data*); a genuinely external or public API surface — third-party consumers, independent versioning, published documentation (→ *API*).

**Note:** Where the only interface this project has is what its own frontend calls, that interface stays here — *API* only enters scope when the interface is genuinely external-facing. Skip with a citation where there's no server-side or application layer at all.

---

## Data

Covers persistence: the database or storage mechanism, the data model approach, and how the application accesses its data (ORM, query layer, or direct access).

**Deciding question:** Does the project persist or manage data?

**Produces:** `data.md`, or a confirmed project-specific output name when persistence is non-conventional.

**Grounds on:** The functional requirements and the entities the use cases imply. Mutually interdependent with *Frontend* and *Backend* — decided together as the foundational stack.

**Owns:** The database or storage mechanism; the data-access approach; the data model approach; environment variables for data connections.

**Does not own:** Schema migration tooling (→ *Data migrations*); the auth provider's bundled user tables (→ *Authentication & authorisation*).

**Note:** Skip with a citation for stateless projects.

---

## API

Covers a genuinely external or public API surface: its contract shape (REST, GraphQL, RPC), versioning strategy, authentication and rate limiting for third-party consumers, and how it's documented and published. This is distinct from the interface a project's own frontend or internal clients call, which stays with *Backend*.

**Deciding question:** Does the project expose an API to consumers outside its own frontend or internal clients — third parties, external partners, or the public — with its own versioning or published documentation?

**Produces:** `api.md`

**Grounds on:** The foundational stack (`backend.md`, `data.md`) — the public contract is layered on top of the internal implementation already decided, not chosen independently of it. Also the auth decision (`auth.md`), for how the project's own users authenticate — this component only owns how *external* consumers authenticate.

**Owns:** The public API's contract shape and versioning strategy; authentication and rate limiting for external consumers; published documentation approach; environment variables specific to the external API surface.

**Does not own:** The backend language, framework, and execution model (→ *Backend*); the interface consumed only by the project's own frontend (→ *Backend*); the project's own user-facing auth mechanism (→ *Authentication & authorisation*); consuming someone else's external API as an integration (→ *Third-party integrations*).

**Note:** Zero external API surface is a valid, complete outcome for most MVPs — skip it with a citation to *Backend*'s interface decision rather than writing a file. Only keep this selected when there's a genuine external contract to design, not simply because the project has an API of some kind.

---

## MCP Server

Covers the project exposing its own capabilities as an MCP server: which tools, resources, or prompts it exposes and their shape, the transport (stdio, HTTP, SSE), and how the server is packaged and distributed. This is about the project *offering* an MCP surface for other agents or tools to call — the project *consuming* someone else's MCP server or tools is a *Third-party integrations* decision, not this one.

**Deciding question:** Does the project expose its own capabilities as an MCP server for other agents or tools to call?

**Produces:** `mcp-server.md`

**Grounds on:** The foundational stack (`backend.md`) — the MCP server is typically built on the same language and framework already decided. Also the auth decision (`auth.md`), if MCP clients need to authenticate.

**Research focus:** The MCP ecosystem moves fast enough to check current SDK, transport, and packaging conventions deliberately rather than from memory, even more so than for most other components.

**Owns:** Which tools, resources, or prompts the server exposes and their shape; the transport mechanism; packaging and distribution; environment variables or configuration specific to the MCP server; authentication for MCP clients connecting to it, if any.

**Does not own:** Consuming an external MCP server or tools as part of the project's own capabilities (→ *Third-party integrations*); the backend language and framework it's built on (→ *Backend*).

**Note:** Zero MCP surface is a valid, complete outcome — skip it with a citation if the project has no reason to expose one. Do not confuse this with the project using MCP tools itself; that's an integration, not this component.

---

## Authentication & authorisation

Covers the auth mechanism (session-based, JWT, OAuth, or managed provider), the provider or library chosen, how auth state is carried, and any roles or access levels the application enforces.

**Deciding question:** Does the project require user identity or access control?

**Produces:** `auth.md`

**Grounds on:** The foundational stack — the framework, data layer, and hosting platform each constrain which auth approaches are practical.

**Owns:** Auth mechanism and provider choice; any services bundled with a managed provider (e.g. email delivery for magic links or password resets); how auth state is carried; roles and access levels enforced; environment variables introduced by the auth setup.

**Does not own:** Non-auth external services, even if they share a vendor with the auth provider (→ *Third-party integrations*); how external API consumers authenticate (→ *API*).

**Note:** Managed providers trade operational simplicity for reversibility; custom implementations trade simplicity for control. Consequences must record the environment variables introduced and any data-model implications (required user or session tables).

---

## Third-party integrations

Covers all external services required by the project: payment providers, email delivery, file storage, analytics, communication tools, external MCP servers or tools the project consumes, and any other external APIs. Evaluates SDK or API approach, provider options where a genuine choice exists, and the architectural implications of each integration for the chosen stack.

**Deciding question:** Does the project require any external service or API beyond the foundational stack?

**Produces:** One decision file per integration (e.g. `payments.md`, `email.md`, `storage.md`).

**Grounds on:** The foundational stack — evaluate each integration's SDK or API approach against the chosen language and framework, and against the decisions already recorded, not in isolation.

**Owns:** All external services required by the project that are not already settled by *Authentication & authorisation*; SDK or API approach for each; environment variables introduced by each integration.

**Does not own:** The auth provider and any services bundled with it (→ *Authentication & authorisation*).

**Note:** Mandated providers are constraints, not decisions — state them plainly and do not fabricate a comparison. Zero integrations is a valid, complete outcome: write zero files and add no index row.

---

## Hosting

Covers the runtime environment type and hosting platform where the application is deployed: static hosting, server-side runtime, serverless, or containerised; the platform; and the environment names in use (e.g. staging, production).

**Deciding question:** Does the project have a deployed runtime that requires a hosting platform decision?

**Produces:** `hosting.md`

**Grounds on:** The foundational stack — the runtime environment type follows from the frontend, backend, and data choices.

**Owns:** Runtime environment type; hosting platform; environment names; platform-specific configuration file; environment variable names and purpose per environment; capability notes on native preview environments and native logging.

**Does not own:** Secrets injection strategy (→ *Deployment*); whether to use preview environments in CI (→ *Deployment*); whether native logging is sufficient — hosting records the capability, observability makes the call (→ *Observability*); CI/CD pipeline mechanism and triggers (→ *Deployment*).

**Note:** Hosting and deployment are separate decisions — hosting settles where the application runs; how code gets there is *Deployment*.

---

## Deployment

Covers the CI/CD pipeline and automated build process: provider, pipeline trigger, build command, deploy command, and any CI/CD-specific configuration file.

**Deciding question:** Does the project automate its build and deployment process?

**Produces:** `deployment.md`

**Grounds on:** The hosting decision (`hosting.md`) and the pipeline trigger type implied by the branching model.

**Owns:** CI/CD provider or native deployment mechanism; pipeline trigger; build and deploy commands; CI/CD configuration file; secrets injection strategy; preview environment usage; environment variables introduced by the pipeline itself; the pipeline step that implements the migration policy stated in `data-migrations.md`.

**Does not own:** Hosting platform and environment names (→ *Hosting*); migration execution policy itself (→ *Data migrations*); test and check commands (→ *Testing*, *Formal checks*).

**Note:** Consequences must record pipeline-introduced environment variables, the local-development secrets convention, and the pipeline step implementing the migration policy from `data-migrations.md`.

---

## Version control

Covers the VCS platform choice: GitHub, GitLab, Bitbucket, or a self-hosted alternative.

**Deciding question:** Is the VCS platform an open choice for this project, or is it already fixed?

**Produces:** `version-control.md`

**Grounds on:** Team context, and integration affinity with the CI/CD provider already decided.

**Owns:** VCS platform choice; repository structure if relevant; platform capabilities relevant to branching, recorded as notes for *Branching strategy*.

**Does not own:** Branching model, PR workflow, and branch protection decisions (→ *Branching strategy*).

**Note:** A mandated platform reduces this to a confirmation rather than a genuine choice — state it plainly, don't fabricate a comparison.

---

## Branching strategy

Covers the branching model, branch naming conventions, pull request and review approach, and branch protection or merge rules suited to the team size and workflow.

**Deciding question:** Does the project need a defined branching model and PR workflow to guide the build?

**Produces:** `branching.md`

**Grounds on:** The VCS decision (`version-control.md`) and any pipeline trigger already recorded in `deployment.md`.

**Owns:** Branching model; branch naming conventions; PR and review approach; branch protection or merge rules; the implied pipeline trigger type, recorded for *Deployment* to implement.

**Does not own:** VCS platform choice (→ *Version control*); pipeline trigger configuration itself (→ *Deployment*).

**Note:** Simpler is almost always better for an MVP — a model mismatched to team size or deployment frequency creates friction throughout the project.

---

## Testing

Covers the test runner and framework, which test types are in scope for the MVP (unit, integration, end-to-end), and how tests run in CI.

**Deciding question:** Does the project have automated tests?

**Produces:** `testing.md`

**Grounds on:** The foundational stack's language and framework, and the CI/CD setup (`deployment.md`). This is grounding, not interdependence — decided after the stack, not with it.

**Owns:** Test runner and framework; test types in scope for the MVP; test commands and CI test job configuration.

**Does not own:** Pre-commit hooks and type checkers (→ *Formal checks*); pipeline job structure and ordering (→ *Deployment*).

---

## Formal checks

Covers code quality tooling: linter and ruleset, formatter, type checker and strictness level, and whether a pre-commit hook enforces these locally before CI picks them up.

**Deciding question:** Does the project enforce code quality tooling?

**Produces:** `formal-checks.md`

**Grounds on:** The foundational stack's language and framework, and the CI/CD setup (`deployment.md`). Grounding, not interdependence — decided after the stack.

**Owns:** Linter and ruleset; formatter; type checker and strictness level; pre-commit hook runner and what it enforces; check commands and CI check job configuration.

**Does not own:** Test runner and test types (→ *Testing*); pipeline job structure and ordering (→ *Deployment*).

---

## Data migrations

Covers the migration tooling choice, how migration files are stored and versioned, and how migrations integrate into the deployment pipeline (automatic or manual step).

**Deciding question:** Does the project have a persistent data layer with a schema that will evolve over time?

**Produces:** `data-migrations.md`

**Grounds on:** The foundational data-layer decision (`data.md`) and the deployment pipeline (`deployment.md`).

**Owns:** Migration tool or mechanism; how migration files are stored and versioned; pipeline integration policy — automatic or manual, and at what point.

**Does not own:** The CI/CD pipeline step that implements the migration policy (→ *Deployment*, wired up from the policy stated here).

**Note:** Don't duplicate functionality the platform already provides natively (e.g. a managed database's own migration CLI).

---

## Observability

Covers error tracking, the logging approach (platform-native, a structured logging library, or a log aggregation service), and alerting setup if in scope.

**Deciding question:** Does the project need visibility into errors and application behaviour once deployed?

**Produces:** `observability.md`

**Grounds on:** The foundational stack and hosting decisions, and the deployment pipeline (`deployment.md`) for wiring.

**Owns:** Error tracking tool choice (or none, with rationale); whether native logging is sufficient or a dedicated tool is needed; alerting setup; environment variables introduced.

**Does not own:** The fact that a platform provides native logging — that's a capability noted in `hosting.md`; this component decides whether it's sufficient. Deployment pipeline steps for observability wiring (→ *Deployment*).

**Note:** Keep the MVP setup proportionate — a well-configured error tracker with environment-aware logging is sufficient for most projects; performance monitoring and distributed tracing are typically post-MVP.
