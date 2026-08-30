# Repository Guidelines

## Project Structure

This repository is a pnpm TypeScript monorepo. Reusable libraries live under
`packages/`: `agent-core` owns the Turn/Tool loop, `agent-runtime` owns durable
Runs, leases, notification, dispatch, tool policy, approval, idempotency and
audit, and `workspace` owns collaboration facts and Attention views.
The private executable is `apps/fastmpa`; architecture and learning plans are
under `docs/`. Keep platform-specific rules out of Core.

## Build, Test, and Development Commands

Use the repository recipes from the root:

```bash
just init       # install workspace dependencies
just check      # run Biome checks
just build      # build all workspace members
just typecheck  # type-check all members
just test       # run all Vitest suites
just ci         # run the complete local validation sequence
```

Run one member while iterating, for example `pnpm --filter fastmpa test` or
`pnpm --filter agent-runtime typecheck`. Add a new typed package with
`just add-lib package-name`; use `just add-cli app-name` for a CLI.

## Coding Style and Naming

Use TypeScript, two-space indentation, double quotes, semicolons, and explicit
return types for exported APIs. Biome is the source of truth for formatting and
linting. Use `camelCase` for variables/functions, `PascalCase` for classes and
interfaces, and kebab-case package directories. Prefer small modules with named exports and keep
cross-package imports pointed at package exports, not internal source paths.

## Testing Guidelines

Tests use Vitest and live in each member's `tests/` directory. Name files
`*.test.ts`, test public behavior and failure/recovery boundaries, and use
deterministic fakes for models, clocks, and external clients. Run the affected
package test first, then `just ci` before submitting a change.

## Commits and Pull Requests

Use short imperative commit subjects with a focused scope, such as
`Add approval resume coordinator`. Pull requests should explain the behavior
change, identify affected packages, link the issue when one exists, and include
commands and results for checks, builds, typechecks, and tests. Include sample
CLI output or screenshots when changing user-visible behavior.

## Safety and Configuration

Never commit credentials. Real TAPD access uses environment variables such as
`TAPD_API_USER` and `TAPD_API_PASSWORD`; fixtures belong in
`apps/fastmpa/fixtures/`. External writes must go through Runtime Tooling
approval, idempotency, old-value checks, and audit logging.
