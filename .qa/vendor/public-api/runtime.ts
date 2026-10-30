import { getPublicCaseSource, getRiskSignalProvider } from "./adapters/resolve";
import { PublicApiService } from "./service";

let service: PublicApiService | null = null;

export function getPublicApiService(): PublicApiService {
  if (!service) {
    service = new PublicApiService(getPublicCaseSource(), getRiskSignalProvider());
  }
  return service;
}

export function __resetPublicApiServiceForTests() {
  service = null;
}
