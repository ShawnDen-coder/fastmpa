import pino, {
  type DestinationStream,
  type Level,
  type Logger,
  type LoggerOptions,
} from "pino";
import pretty from "pino-pretty";

export type { Logger };

export interface CreateLoggerOptions {
  /** Pino log level; defaults to info. */
  readonly level?: Level;
  /** Stable component name included in every record. */
  readonly service?: string;
  /** Stable component field. `service` is retained for compatibility. */
  readonly component?: string;
  /** Optional file path. Relative paths resolve from process.cwd(). */
  readonly logPath?: string;
  /** Custom stream for embedding applications and tests. */
  readonly destination?: DestinationStream;
  /** Pretty-print terminal output; defaults to true. File output stays JSON. */
  readonly pretty?: boolean;
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
  // 日志传输由 Host 决定；库本身不在 import 时创建会写终端的全局 logger。
  const level = (loggerOptions.level ??
    process.env.FASTMPA_LOG_LEVEL ??
    "info") as Level;
  const options: LoggerOptions = {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: [
      "password",
      "*.password",
      "**.password",
      "token",
      "*.token",
      "**.token",
      "authorization",
      "*.authorization",
      "**.authorization",
      "apiKey",
      "*.apiKey",
      "**.apiKey",
      "cookie",
      "*.cookie",
      "**.cookie",
      "secret",
      "*.secret",
      "**.secret",
    ],
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
    fileStream ??
    createConsoleStream(loggerOptions);
  const instance = pino(options, destination);
  // child binding 统一提供组件名，调用方再附加 workspace/run 等关联字段。
  const component =
    loggerOptions.component ?? loggerOptions.service ?? "agent-core";
  return instance.child({ component, ...(bindings ?? {}) });
}

/**
 * Default logger for simple local use.
 *
 * Turn code should prefer an injected child logger once Runtime exists.
 */
/** 未注入 logger 时使用静默 fallback，避免库代码污染宿主 stdout/stderr。 */
export const logger = pino({ enabled: false });

function createConsoleStream(options: CreateLoggerOptions): DestinationStream {
  if (options.pretty === false) return process.stderr;
  return pretty({
    colorize: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
    singleLine: true,
  });
}
