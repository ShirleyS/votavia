/**
 * Selector de fuente para la consola de gobierno.
 *
 * `NEXT_PUBLIC_VOTAVIA_API_MODE=demo` (predeterminado) usa la muestra local.
 * `NEXT_PUBLIC_VOTAVIA_API_MODE=core` usa el adaptador contra el núcleo de
 * Session 1 y exige sesión válida (`/api/organizations/me`).
 */
import { MockGovernmentService } from "../mock-service";
import { CoreGovernmentService, PENDING_CONTRACTS } from "./adapter";
import type { GovernmentDataSource, GovernmentService } from "../types";

export interface GovernmentServiceAdapter extends GovernmentService {
  subscribe?: (listener: () => void) => () => void;
  resetMockData?: () => void;
}

export const coreMode =
  (process.env.NEXT_PUBLIC_VOTAVIA_API_MODE ?? "demo").toLowerCase() === "core";

export const dataSource: GovernmentDataSource = coreMode ? "core" : "demo";

export const coreService = new CoreGovernmentService();
const mockService = new MockGovernmentService();

export const governmentService: GovernmentServiceAdapter = coreMode
  ? coreService
  : mockService;

export { PENDING_CONTRACTS };
