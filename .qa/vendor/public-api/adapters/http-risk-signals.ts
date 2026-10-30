import { upstreamUnavailable } from "../errors";
import type { ApprovedRiskSignal } from "../risk";
import type { RiskSignalProvider } from "../source";

/**
 * Reads the approved publication feed from Session 3 (preventive engine).
 * Contract expected at VOTAVIA_RISK_SIGNALS_URL:
 *   GET → { signals: ApprovedRiskSignal[] }
 * The feed must already be human-approved; this API adds no analysis.
 */
export class HttpRiskSignalProvider implements RiskSignalProvider {
  readonly kind = "live" as const;

  constructor(
    private readonly options: { url: string; token?: string; timeoutMs?: number },
  ) {}

  async listApproved(): Promise<ApprovedRiskSignal[]> {
    let response: Response;
    try {
      response = await fetch(this.options.url, {
        headers: {
          accept: "application/json",
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
        cache: "no-store",
      });
    } catch {
      throw upstreamUnavailable("No fue posible consultar el servicio de señales preventivas.");
    }
    if (!response.ok) {
      throw upstreamUnavailable(
        `El servicio de señales preventivas respondió ${response.status}.`,
      );
    }
    const payload = (await response.json().catch(() => null)) as
      | { signals?: ApprovedRiskSignal[] }
      | null;
    if (!payload || !Array.isArray(payload.signals)) {
      throw upstreamUnavailable("El servicio de señales devolvió un formato inesperado.");
    }
    return payload.signals;
  }
}
