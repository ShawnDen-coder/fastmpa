# fastmpa

core

## Workspace Structure

```
fastmpa/
  packages/
    agent-core/   ← initial sub-package
  pnpm-workspace.yaml
```

## Common Commands

### Initialize workspace

```bash
pnpm install
```

### Run dev server for a sub-package

```bash
pnpm --filter agent-core dev
```

### Build all sub-packages

```bash
pnpm -r run build
```

### Add a dependency to a sub-package

```bash
pnpm --filter agent-core add <package-name>
```

### Add a new sub-package to the workspace

```bash
repo-scaffold add-package <new-package-name>
```

### Format code

```bash
pnpm format
```

## License

MIT
