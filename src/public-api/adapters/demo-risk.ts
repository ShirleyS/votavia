import type { ApprovedRiskSignal } from "../risk";
import type { RiskSignalProvider } from "../source";
import { demoRiskSignals } from "../mock-data";

export class DemoRiskSignalProvider implements RiskSignalProvider {
  readonly kind = "demo" as const;

  async listApproved(): Promise<ApprovedRiskSignal[]> {
    return demoRiskSignals;
  }
}
