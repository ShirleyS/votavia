export type CollectorErrorCode =
  | "CONFIG_INVALID"
  | "HTTP_ERROR"
  | "HTTP_TIMEOUT"
  | "CKAN_INVALID_RESPONSE"
  | "CKAN_NO_RESOURCES"
  | "DOWNLOAD_FAILED"
  | "DOWNLOAD_CONTENT_INVALID"
  | "DOWNLOAD_TOO_LARGE"
  | "CSV_INVALID"
  | "SCHEMA_INVALID"
  | "EXPORT_LIMIT"
  | "VALIDATION_FAILED"
  | "BROWSER_COLLECTION_DISABLED"
  | "BROWSER_NOT_INSTALLED"
  | "BROWSER_DISCOVERY_FAILED"
  | "DASHBOARD_NOT_CONFIGURED"
  | "CHECKPOINT_INVALID"
  | "FIXTURE_INVALID";

export class CollectorError extends Error {
  readonly code: CollectorErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: CollectorErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CollectorError";
    this.code = code;
    this.details = options.details;
  }
}

export class HttpError extends CollectorError {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message?: string) {
    super("HTTP_ERROR", message ?? `HTTP ${status} for ${url}`, {
      details: { status, url },
    });
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export class CsvParseError extends CollectorError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CSV_INVALID", message, { details });
    this.name = "CsvParseError";
  }
}

export function isCollectorError(error: unknown): error is CollectorError {
  return error instanceof CollectorError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
