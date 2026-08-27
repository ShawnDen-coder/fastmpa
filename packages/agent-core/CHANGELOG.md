---
# Changelog

All notable changes to `agent-core` are documented in this file.

## Unreleased

### Fixed

- Propagate cancellation signals through model requests, OpenRouter fetch calls, tool validation, and tool execution.
- Preserve structured model retry semantics instead of treating every model failure as retryable.
- Reject malformed OpenRouter tool calls instead of silently dropping them.
- Reject tool names with leading or trailing whitespace.

### Changed

- Require every `ToolImplementation` to provide a runtime `validate` function. Parameter schemas remain model-facing metadata and do not replace runtime validation.

### Verification

- 27 Vitest tests pass across model, tool, context, guard, and Turn behavior.
- TypeScript type checking and the package build pass.
