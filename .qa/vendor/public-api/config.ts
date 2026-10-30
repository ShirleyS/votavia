export function isLiveMode(): boolean {
  return (
    (process.env.VOTAVIA_PUBLIC_API_MODE ?? "").trim().toLowerCase() === "live" ||
    Boolean((process.env.VOTAVIA_INTERNAL_API_BASE_URL ?? "").trim())
  );
}

export function internalApiBaseUrl(): string {
  const explicit = (process.env.VOTAVIA_INTERNAL_API_BASE_URL ?? "").trim();
  if (explicit) return explicit;
  if (isLiveMode()) return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  return "";
}

export function internalApiToken(): string | undefined {
  return (process.env.VOTAVIA_INTERNAL_API_TOKEN ?? "").trim() || undefined;
}

export function riskSignalsUrl(): string {
  return (process.env.VOTAVIA_RISK_SIGNALS_URL ?? "").trim();
}

export function riskSignalsToken(): string | undefined {
  return (process.env.VOTAVIA_RISK_SIGNALS_TOKEN ?? "").trim() || undefined;
}

export function publicApiBasePath(): string {
  return "/api/v1/public";
}
