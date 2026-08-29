import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  type Level,
} from "pino";

export type { Logger };

export interface CreateLoggerOptions {
  /** Pino log level; defaults to info. */
  readonly level?: Level;
  /** Stable component name included in every record. */
  readonly service?: string;
  /** Optional file path. Relative paths resolve from process.cwd(). */
  readonly logPath?: string;
  /** Custom stream for embedding applications and tests. */
  readonly destination?: DestinationStream;
}

/**
 * Create a logger with stable service metadata.
 *
 * Runtime-specific code can create a child logger with identifiers such as
 * agentId, runId, and turnId without coupling Agent Core to a transport.
 */
export function createLogger(
  bindings?: Record<string, unknown>,
  loggerOptions: CreateLoggerOptions = {},
): Logger {
  const options: LoggerOptions = {
    level: loggerOptions.level ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: loggerOptions.service ?? "fastmpa-agent-core",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: ["password", "token", "authorization", "apiKey"],
  };
  const fileStream = loggerOptions.logPath
    ? pino.destination({
        dest: loggerOptions.logPath,
        mkdir: true,
        sync: false,
      })
    : undefined;
  const destination =
    loggerOptions.destination ??
    (fileStream
      ? pino.multistream([
          { level: loggerOptions.level ?? "info", stream: process.stdout },
          { level: loggerOptions.level ?? "info", stream: fileStream },
        ])
      : process.stdout);
  const instance = pino(options, destination);
  return bindings ? instance.child(bindings) : instance;
}

/**
 * Default logger for simple local use.
 *
 * Turn code should prefer an injected child logger once Runtime exists.
 */
export const logger = createLogger();
