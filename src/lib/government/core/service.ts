/**
 * Selector de fuente para la consola de gobierno.
 *
 * El camino de producción usa el núcleo de Session 1 (`/api/issues`,
 * `/api/issues/[id]/operational`, `/api/issues/[id]/evidence`,
 * `/api/organizations/me`). No hay respaldo silencioso a datos de muestra: si el
 * núcleo no responde, la consola muestra el error y nunca inventa expedientes.
 *
 * `NEXT_PUBLIC_VOTAVIA_API_MODE=demo` es una excepción explícita para recorridos
 * de muestra sin núcleo; queda rotulada en la interfaz y sólo se activa a mano.
 */
import { MockGovernmentService } from "../mock-service";
import { CoreGovernmentService, PENDING_CONTRACTS } from "./adapter";
import type { GovernmentDataSource, GovernmentService } from "../types";

export interface GovernmentServiceAdapter extends GovernmentService {
  subscribe?: (listener: () => void) => () => void;
  resetMockData?: () => void;
}

const configuredMode = (process.env.NEXT_PUBLIC_VOTAVIA_API_MODE ?? "core").trim().toLowerCase();

/** Sólo un valor explícito deja la consola en modo de muestra local. */
export const demoMode = configuredMode === "demo";

/** Modo núcleo: camino de producción por omisión. */
export const coreMode = !demoMode;

export const dataSource: GovernmentDataSource = coreMode ? "core" : "demo";

export const coreService = new CoreGovernmentService();

/**
 * La muestra local se construye de forma diferida y sólo en modo demostración
 * explícito, así el camino de producción nunca instancia ni lee `localStorage`.
 */
let mockInstance: MockGovernmentService | null = null;

function mockService(): MockGovernmentService {
  if (!mockInstance) mockInstance = new MockGovernmentService();
  return mockInstance;
}

export const governmentService: GovernmentServiceAdapter = coreMode
  ? coreService
  : (new Proxy({} as GovernmentServiceAdapter, {
      get(_target, property) {
        const instance = mockService() as unknown as Record<string | symbol, unknown>;
        const value = instance[property];
        return typeof value === "function" ? value.bind(instance) : value;
      },
    }) satisfies GovernmentServiceAdapter);

export { PENDING_CONTRACTS };
