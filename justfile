set dotenv-load := true
set shell := ["bash", "-euc"]
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show available recipes
default:
    @just --list

# Install workspace dependencies
init:
    pnpm install

# Run Biome checks without modifying files
check:
    pnpm check

# Run Biome checks and apply safe automatic fixes
lint:
    pnpm exec biome check --write .

# Format all supported files with Biome
format:
    pnpm format

# Build all workspace members in dependency order
build:
    pnpm --config.confirmModulesPurge=false -r --if-present run build

# Type check all workspace members in dependency order
typecheck:
    pnpm --config.confirmModulesPurge=false -r --if-present run typecheck

# Run all workspace tests
test:
    pnpm --config.confirmModulesPurge=false -r --if-present run test

# Run the built CLI against a throwaway database.
cli-smoke:
    powershell -NoProfile -Command "Set-Item Env:FASTMPA_DB (Join-Path ([IO.Path]::GetTempPath()) 'fastmpa-cli-smoke.sqlite'); Remove-Item -LiteralPath (Join-Path ([IO.Path]::GetTempPath()) 'fastmpa-cli-smoke.sqlite') -Force -ErrorAction SilentlyContinue; node apps/fastmpa/dist/index.js doctor; node apps/fastmpa/dist/index.js run smoke; Remove-Item -LiteralPath (Join-Path ([IO.Path]::GetTempPath()) 'fastmpa-cli-smoke.sqlite') -Force -ErrorAction SilentlyContinue"

# Reproduce the GitHub CI checks locally
ci:
    pnpm check
    just build
    just typecheck
    just test
    just cli-smoke

# Prepare the package selected by a release tag, for example agent-core-0.2.0.
package tag:
    node -e "const {mkdirSync,readFileSync}=require('node:fs');const {execSync:run}=require('node:child_process');const tag=process.argv[1];const match=/^(.+)-([0-9]+\.[0-9]+\.[0-9]+)/.exec(tag);if(!match||match[0]!==tag)throw new Error('Invalid package tag: '+tag);const manifest=JSON.parse(readFileSync('packages/'+match[1]+'/package.json','utf8'));if(manifest.version!==match[2])throw new Error('Tag '+tag+' does not match '+manifest.name+'@'+manifest.version);if(manifest.private===true)throw new Error(manifest.name+' is private');mkdirSync('release',{recursive:true});run('pnpm --filter '+manifest.name+' pack --pack-destination release',{stdio:'inherit',shell:true})" "{{tag}}"

# Run the complete release validation and stage the selected package.
release-check tag:
    just check
    just build
    just typecheck
    just test
    just package {{tag}}

# Build and archive the complete FastMPA monorepo release.
release-monorepo tag:
    just check
    just build
    just typecheck
    just test
    node -e "require('node:fs').mkdirSync('release',{recursive:true})"
    git archive --format=tar.gz --prefix=fastmpa-{{tag}}/ HEAD -o release/fastmpa-{{tag}}.tar.gz

# Pinned version used by all member-generation recipes.
repo_scaffold_version := "0.35.0"

# Add a typed workspace member through the pinned repo-scaffold release.
add-member name member_type="ts-lib" location="packages":
    uvx --from "repo-scaffold==0.35.0" repo-scaffold add-member {{name}} --type {{member_type}} --location {{location}} --project-path . --no-install --no-verify
    pnpm install

# Add a TypeScript library under packages/.
add-lib name:
    just add-member {{name}} ts-lib packages


# Add a Vite-built TypeScript CLI under apps/.
add-cli name:
    just add-member {{name}} ts-cli apps

# Add a private application under apps/.
add-app name:
    uvx --from "repo-scaffold==0.35.0" repo-scaffold add-member {{name}} --type ts-cli --location apps --private --depends-on "@shawnden-coder/agent-runtime" --project-path . --no-install --no-verify
    pnpm install

# Deprecated package terminology retained for team muscle memory.
add-package name:
    just add-lib {{name}}

# Preview a member generation without changing the workspace.
plan-member name member_type="ts-lib":
    uvx --from "repo-scaffold==0.35.0" repo-scaffold add-member {{name}} --type {{member_type}} --project-path . --no-install --no-verify
    pnpm install --dry-run
