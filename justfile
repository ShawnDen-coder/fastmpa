set dotenv-load := true
set shell := ["bash", "-euc"]
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show available recipes
default:
    @just --list

# Install workspace dependencies
init:
    pnpm install

# Run Prettier format check
lint:
    pnpm format:check

# Run Prettier with auto-fix
format:
    pnpm format

# Build all workspace packages
build:
    pnpm -r run build

# Type check all workspace packages
typecheck:
    pnpm -r run typecheck

# Run all workspace tests
test:
    pnpm -r run test

# Reproduce the GitHub CI checks locally
ci:
    pnpm format:check
    pnpm -r run typecheck
    pnpm -r run build
    pnpm -r run test

# Pinned version used by all member-generation recipes.
repo_scaffold_version := "0.35.0"

# Add a typed workspace member through the pinned repo-scaffold release.
add-member name member_type="ts-lib":
    uvx --from "repo-scaffold==0.35.0" repo-scaffold add-member {{name}} --type {{member_type}} --project-path .

# Add a TypeScript library under packages/.
add-lib name:
    just add-member {{name}} ts-lib


# Add a Vite-built TypeScript CLI under packages/.
add-cli name:
    just add-member {{name}} ts-cli
# Deprecated package terminology retained for team muscle memory.
add-package name:
    just add-member {{name}} ts-lib

# Preview a member generation without changing the workspace.
plan-member name member_type="ts-lib":
    uvx --from "repo-scaffold==0.35.0" repo-scaffold add-member {{name}} --type {{member_type}} --project-path . --dry-run
