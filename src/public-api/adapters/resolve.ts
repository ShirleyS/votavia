import { upstreamUnavailable } from "../errors";
import {
  internalApiBaseUrl,
  internalApiToken,
  isLiveMode,
  riskSignalsToken,
  riskSignalsUrl,
} from "../config";
import type { PublicCaseSource, RiskSignalProvider } from "../source";
import { DemoCaseSource } from "./demo-source";
import { DemoRiskSignalProvider } from "./demo-risk";
import { HttpCaseSource } from "./http-case-source";
import { HttpRiskSignalProvider } from "./http-risk-signals";
import { CompositeCaseSource } from "./composite-source";
import {
  Session6OfficialCaseSource,
  officialManifestPath,
  officialRecordsPath,
} from "./session6-official-source";

let caseSource: PublicCaseSource | null = null;
let riskProvider: RiskSignalProvider | null | undefined;

/**
 * Single swap point for integration.
 *
 * - Demo (default): deterministic fixtures, no platform required.
 * - Live: set VOTAVIA_PUBLIC_API_MODE=live and VOTAVIA_INTERNAL_API_BASE_URL.
 * - In-process: after merging, replace `new HttpCaseSource(...)` with
 *   `createCaseServiceSource(getCaseService())` from `./case-service-source`.
 */
export function getPublicCaseSource(): PublicCaseSource {
  if (caseSource) return caseSource;

  caseSource = createBaseSource();
  const officialPath = officialRecordsPath();
  if (officialPath) {
    // Session 6 output is layered on top; it never replaces Session 1.
    caseSource = new CompositeCaseSource(
      caseSource,
      new Session6OfficialCaseSource(officialPath, officialManifestPath()),
    );
  }
  return caseSource;
}

function createBaseSource(): PublicCaseSource {
  const base = internalApiBaseUrl();
  if (base) {
    return new HttpCaseSource({ baseUrl: base, token: internalApiToken() });
  }
  if (isLiveMode()) {
    return {
      kind: "live",
      async listPublished() {
        throw upstreamUnavailable(
          "Falta configurar VOTAVIA_INTERNAL_API_BASE_URL para leer los casos de la plataforma.",
        );
      },
      async getById() {
        throw upstreamUnavailable(
          "Falta configurar VOTAVIA_INTERNAL_API_BASE_URL para leer los casos de la plataforma.",
        );
      },
      async statistics() {
        throw upstreamUnavailable(
          "Falta configurar VOTAVIA_INTERNAL_API_BASE_URL para leer los casos de la plataforma.",
        );
      },
    };
  }
  return new DemoCaseSource();
}

/**
 * Risk signals are never fabricated in live mode: without an approved feed the
 * endpoint returns 503 instead of mixing demo signals into real data.
 */
export function getRiskSignalProvider(): RiskSignalProvider | null {
  if (riskProvider !== undefined) return riskProvider;

  const url = riskSignalsUrl();
  if (url) {
    riskProvider = new HttpRiskSignalProvider({ url, token: riskSignalsToken() });
  } else {
    riskProvider = isLiveMode() ? null : new DemoRiskSignalProvider();
  }
  return riskProvider;
}

/** Test-only hooks. */
export function __setPublicCaseSourceForTests(source: PublicCaseSource | null) {
  caseSource = source;
}

export function __setRiskSignalProviderForTests(provider: RiskSignalProvider | null) {
  riskProvider = provider;
}
