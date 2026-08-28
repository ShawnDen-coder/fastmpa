import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger };

const options: LoggerOptions = {
  level: "info",
  base: {
    service: "fastpma-agent-core",
  },
  redact: ["password", "token", "authorization", "apiKey"],
};

/**
 * Create a logger with stable service metadata.
 *
 * Runtime-specific code can create a child logger with identifiers such as
 * agentId, runId, and turnId without coupling Agent Core to a transport.
 */
export function createLogger(bindings?: Record<string, unknown>): Logger {
  const instance = pino(options);
  return bindings ? instance.child(bindings) : instance;
}

/**
 * Default logger for simple local use.
 *
 * Turn code should prefer an injected child logger once Runtime exists.
 */
export const logger = createLogger();
