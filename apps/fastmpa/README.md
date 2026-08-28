# FastMPA

The final FastMPA program lives here. This private app composes the reusable
libraries under `packages/` and is the future home for Runtime, Skills, and
MCP integration wiring.

## Commands

```bash
pnpm --filter fastmpa build
pnpm --filter fastmpa test
node apps/fastmpa/dist/index.cjs hello -n FastMPA
```

The generated executable entry point is `dist/index.cjs`. The app itself is
private; publishable functionality belongs in `packages/`.
