import { errorMessage } from "../errors.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(options: { level?: LogLevel; json?: boolean; sink?: (line: string) => void } = {}): Logger {
  const minimum = LEVELS[options.level ?? "info"];
  const sink = options.sink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const emit = (level: LogLevel, message: string, details?: Record<string, unknown>): void => {
    if (LEVELS[level] < minimum) return;
    if (options.json) {
      sink(JSON.stringify({ at: new Date().toISOString(), level, message, ...details }));
    } else {
      const suffix = details && Object.keys(details).length > 0 ? ` ${formatDetails(details)}` : "";
      sink(`[${level}] ${message}${suffix}`);
    }
  };
  return {
    debug: (message, details) => emit("debug", message, details),
    info: (message, details) => emit("info", message, details),
    warn: (message, details) => emit("warn", message, details),
    error: (message, details) => emit("error", message, details),
  };
}

export function logError(logger: Logger, error: unknown): void {
  logger.error(errorMessage(error), error instanceof Error && error.stack ? { stack: error.stack } : undefined);
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
