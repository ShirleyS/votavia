"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mockDemoUsers } from "@/lib/government/mock-data";
import {
  coreMode,
  coreService,
  dataSource,
  governmentService,
  PENDING_CONTRACTS,
} from "@/lib/government/core/service";
import { isCoreApiError } from "@/lib/government/core/http";
import type {
  CaseAnalysis,
  CasePriority,
  CaseStatus,
  CompletionClaim,
  CompletionClaimInput,
  DemoUser,
  DisputeResponseInput,
  DispatchOrder,
  DispatchState,
  GovernmentCase,
  GovernmentDashboard,
  GovernmentDataSource,
  GovernmentEvidenceInput,
  GovernmentEvidenceRecord,
  GovernmentOrganization,
  GovernmentPermission,
  RiskSignal,
  ServiceAvailability,
  SpecialistRecommendation,
} from "@/lib/government/types";

const DEMO_USER_KEY = "votavia-government-demo-user-v1";

const CORE_PLACEHOLDER: DemoUser = {
  id: "core-sin-sesion",
  name: "Mesa de gobierno",
  initials: "MG",
  title: "Sesión del núcleo",
  role: "analyst",
  organizationName: "Núcleo VotaVía",
  isDemo: false,
  permissions: [],
  organizationId: null,
  organizationIds: [],
  source: "core",
};

function initialDemoUser(): DemoUser {
  if (typeof window === "undefined") return mockDemoUsers[0];
  const stored = window.localStorage.getItem(DEMO_USER_KEY);
  return mockDemoUsers.find((user) => user.id === stored) ?? mockDemoUsers[0];
}

function hasPermission(
  user: DemoUser,
  permission: GovernmentPermission,
  item?: GovernmentCase,
): boolean {
  if (!user.permissions.includes(permission)) return false;
  if (item?.organizationId) {
    const scope = user.organizationIds ?? (user.organizationId ? [user.organizationId] : []);
    if (scope.length > 0 && !scope.includes(item.organizationId)) return false;
  }
  if (!item || !user.departmentId) return true;
  return item.departmentId === user.departmentId;
}

function permissionError(
  user: DemoUser,
  permission: GovernmentPermission,
  item?: GovernmentCase,
): string | null {
  if (!user.permissions.includes(permission)) {
    return coreMode
      ? `${user.name} no tiene el permiso requerido para esta acción en el núcleo.`
      : `${user.name} no tiene permiso para esta acción en la cuenta de demostración.`;
  }
  if (item?.organizationId) {
    const scope = user.organizationIds ?? (user.organizationId ? [user.organizationId] : []);
    if (scope.length > 0 && !scope.includes(item.organizationId)) {
      return "Tu organización no tiene alcance sobre este expediente. La operación la atiende otra área responsable.";
    }
  }
  if (item && user.departmentId && item.departmentId !== user.departmentId) {
    return `${user.title} sólo puede operar casos de su propia área. Este caso pertenece a otra área.`;
  }
  return null;
}

interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: "success" | "warning" | "info";
}

interface GovernmentContextValue {
  cases: GovernmentCase[];
  loading: boolean;
  currentUser: DemoUser;
  demoUsers: DemoUser[];
  operatorRoster: DemoUser[];
  switchDemoUser: (id: string) => void;
  can: (permission: GovernmentPermission, item?: GovernmentCase) => boolean;
  permissionReason: (
    permission: GovernmentPermission,
    item?: GovernmentCase,
  ) => string | null;
  toast: Toast | null;
  dismissToast: () => void;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  updatePriority: (id: string, priority: CasePriority) => Promise<void>;
  updateStatus: (id: string, status: CaseStatus) => Promise<void>;
  assignDepartment: (id: string, departmentId: string) => Promise<void>;
  assignOperator: (id: string, operatorId: string, operatorName?: string) => Promise<void>;
  uploadEvidence: (
    id: string,
    input: GovernmentEvidenceInput,
  ) => Promise<GovernmentEvidenceRecord>;
  recordCompletion: (
    id: string,
    input: CompletionClaimInput,
  ) => Promise<CompletionClaim>;
  respondDispute: (
    id: string,
    input: DisputeResponseInput,
  ) => Promise<void>;
  authorizeDispatch: (caseId: string, specialistName: string, specialistId: string) => Promise<void>;
  advanceDispatch: (caseId: string, state: DispatchState) => Promise<void>;
  verifyIntervention: (caseId: string, decision: "verified" | "returned") => Promise<void>;
  publishOutcome: (caseId: string, outcome: string) => Promise<void>;
  getDashboard: () => Promise<GovernmentDashboard>;
  getPreventiveSignals: () => Promise<RiskSignal[]>;
  getDispatchOrder: (caseId: string) => Promise<DispatchOrder | null>;
  getDispatchRecommendations: (caseId: string) => Promise<SpecialistRecommendation[]>;
  getCaseAnalysis: (caseId: string) => Promise<CaseAnalysis>;
  resetMockData: () => void;
  dataSource: GovernmentDataSource;
  availability: ServiceAvailability;
  error: string | null;
  authenticated: boolean;
  organizations: GovernmentOrganization[];
  pendingContracts: { id: string; label: string; detail: string }[];
  isDemoEnvironment: boolean;
}

const GovernmentContext = createContext<GovernmentContextValue | null>(null);

function describeError(cause: unknown): { title: string; detail: string; tone: Toast["tone"] } {
  if (isCoreApiError(cause)) {
    switch (cause.kind) {
      case "unauthorized":
        return {
          title: "Sesión requerida",
          detail: "Inicia sesión en la aplicación principal de VotaVía para operar el núcleo.",
          tone: "warning",
        };
      case "forbidden":
        return { title: "Acción no permitida", detail: cause.message, tone: "warning" };
      case "validation":
        return { title: "Revisa los datos", detail: cause.message, tone: "warning" };
      case "rate_limited":
        return {
          title: "Demasiadas solicitudes",
          detail: "Espera un momento antes de volver a cargar evidencia.",
          tone: "warning",
        };
      case "unavailable":
      case "network":
        return {
          title: "Núcleo no disponible",
          detail: cause.message,
          tone: "warning",
        };
      case "pending_contract":
        return {
          title: "Contrato pendiente",
          detail: cause.message,
          tone: "info",
        };
      default:
        return { title: "No se pudo completar la acción", detail: cause.message, tone: "warning" };
    }
  }
  return {
    title: "No se pudo completar la acción",
    detail: cause instanceof Error ? cause.message : "Error desconocido.",
    tone: "warning",
  };
}

export function GovernmentProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<GovernmentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [currentUser, setCurrentUser] = useState<DemoUser>(
    coreMode ? CORE_PLACEHOLDER : initialDemoUser,
  );
  const [organizations, setOrganizations] = useState<GovernmentOrganization[]>([]);
  const [availability, setAvailability] = useState<ServiceAvailability>(
    coreMode ? "connecting" : "demo",
  );
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(!coreMode);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: Omit<Toast, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...next, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4600);
  }, []);

  const showError = useCallback(
    (cause: unknown) => {
      const info = describeError(cause);
      showToast(info);
    },
    [showToast],
  );

  const refresh = useCallback(async () => {
    if (coreMode && !authenticated) {
      setCases([]);
      setLoading(false);
      return;
    }
    try {
      const next = await governmentService.listCases();
      setCases(next);
      setError(null);
      setAvailability(coreMode ? "core" : "demo");
    } catch (cause) {
      if (coreMode) {
        setError(
          isCoreApiError(cause)
            ? cause.message
            : "No se pudo cargar la bandeja del núcleo VotaVía.",
        );
        setAvailability("degraded");
      } else {
        showError(cause);
      }
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [authenticated, showError]);

  const loadCoreSession = useCallback(async () => {
    if (!coreMode) return;
    setAvailability("connecting");
    try {
      const session = await coreService.loadSession();
      const memberships = session.memberships;
      const primary = memberships[0];
      setOrganizations(session.organizations);
      setAuthenticated(session.authenticated);
      if (!session.authenticated || !primary) {
        setCurrentUser(CORE_PLACEHOLDER);
        setError(
          session.authenticated
            ? "La cuenta no pertenece a ninguna organización de gobierno. Pide acceso a la mesa responsable."
            : "No hay una sesión activa del núcleo. Ingresa en VotaVía y vuelve a cargar esta consola.",
        );
        setAvailability("degraded");
        setLoading(false);
        return;
      }
      const organizationName =
        session.organizations[0]?.name ?? primary.organization_id;
      const roleLabel = {
        responder: "Operación de área",
        supervisor: "Supervisión de área",
        admin: "Coordinación de la mesa",
      }[primary.role];
      const demoOrganization =
        primary.organization_id.startsWith("org-demo") ||
        organizationName.toLowerCase().includes("demostración");
      const initials = organizationName
        .replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("") || "MG";
      setCurrentUser({
        id: memberships[0].user_id,
        name: organizationName,
        initials,
        title: roleLabel,
        role: primary.role === "responder" ? "department_operator" : "coordinator",
        organizationName,
        isDemo: demoOrganization,
        organizationId: primary.organization_id,
        organizationIds: memberships.map((membership) => membership.organization_id),
        permissions: session.permissions,
        source: "core",
      });
      setError(null);
      setAvailability("core");
    } catch (cause) {
      setAuthenticated(false);
      setCurrentUser(CORE_PLACEHOLDER);
      setAvailability("degraded");
      setError(describeError(cause).detail);
      setLoading(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setLoading(true);
    if (coreMode) await loadCoreSession();
    await refresh();
  }, [loadCoreSession, refresh]);

  const can = useCallback(
    (permission: GovernmentPermission, item?: GovernmentCase) =>
      hasPermission(currentUser, permission, item),
    [currentUser],
  );

  const permissionReason = useCallback(
    (permission: GovernmentPermission, item?: GovernmentCase) =>
      permissionError(currentUser, permission, item),
    [currentUser],
  );

  const requirePermission = useCallback(
    (permission: GovernmentPermission, item?: GovernmentCase) => {
      const errorMessage = permissionError(currentUser, permission, item);
      if (errorMessage) throw new Error(errorMessage);
    },
    [currentUser],
  );

  const switchDemoUser = useCallback(
    (id: string) => {
      if (coreMode) {
        showToast({
          title: "Cuentas del núcleo",
          detail: "El cambio de roles de muestra sólo aplica en el modo de demostración.",
          tone: "info",
        });
        return;
      }
      const next = mockDemoUsers.find((user) => user.id === id);
      if (!next) return;
      setCurrentUser(next);
      window.localStorage.setItem(DEMO_USER_KEY, next.id);
      showToast({
        title: `Sesión de demostración: ${next.name}`,
        detail: `${next.title}. Los permisos y el alcance por área se aplican en esta sesión.`,
        tone: "info",
      });
    },
    [showToast],
  );

  useEffect(() => {
    void (async () => {
      if (coreMode) {
        await loadCoreSession();
      }
      await refresh();
    })();
    return governmentService.subscribe?.(() => {
      void refresh();
    });
  }, [loadCoreSession, refresh]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const updatePriority = useCallback(
    async (id: string, priority: CasePriority) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      try {
        await governmentService.updateCasePriority(id, priority);
        showToast({
          title: "Prioridad actualizada",
          detail: coreMode
            ? "El ajuste es un indicador local de la consola; el núcleo no expone prioridad."
            : "El cambio ya se refleja en todas las vistas de muestra.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const updateStatus = useCallback(
    async (id: string, status: CaseStatus) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      try {
        await governmentService.updateCaseStatus(id, status);
        showToast({
          title: "Estado operativo actualizado",
          detail:
            "El estado importado y la verificación ciudadana conservan su propio estado.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const assignDepartment = useCallback(
    async (id: string, departmentId: string) => {
      requirePermission("case:assign", cases.find((item) => item.id === id));
      try {
        await governmentService.assignDepartment(id, departmentId);
        showToast({
          title: "Responsabilidad asignada",
          detail: coreMode
            ? "Asignación local etiquetada: el núcleo aún no expone el contrato de responsable."
            : "El área responsable quedó actualizada en la operación.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const assignOperator = useCallback(
    async (id: string, operatorId: string, operatorName?: string) => {
      requirePermission("case:assign", cases.find((item) => item.id === id));
      const name =
        operatorName ??
        mockDemoUsers.find((user) => user.id === operatorId)?.name ??
        operatorId;
      try {
        await governmentService.assignOperator(id, operatorId, name);
        showToast({
          title: "Operador asignado",
          detail: coreMode
            ? "Asignación local etiquetada; el roster de operadores aún no tiene contrato del núcleo."
            : "El operador quedó vinculado al expediente.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const authorizeDispatch = useCallback(
    async (caseId: string, _specialistName: string, specialistId: string) => {
      requirePermission("dispatch:authorize", cases.find((item) => item.id === caseId));
      try {
        await governmentService.authorizeDispatch(caseId, specialistId);
        showToast({
          title: "Despacho autorizado",
          detail: coreMode
            ? "Registrado en el fixture del contrato de despacho de Ismael."
            : "Se notificó al especialista seleccionado.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const advanceDispatch = useCallback(
    async (caseId: string, state: DispatchState) => {
      requirePermission("dispatch:authorize", cases.find((item) => item.id === caseId));
      try {
        await governmentService.advanceDispatch(caseId, state);
        showToast({
          title: "Avance del despacho registrado",
          detail: coreMode
            ? "Actualizado en el fixture local del contrato de Ismael."
            : "La bitácora del despacho registró el avance.",
          tone: "info",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const verifyIntervention = useCallback(
    async (caseId: string, decision: "verified" | "returned") => {
      requirePermission("dispatch:authorize", cases.find((item) => item.id === caseId));
      try {
        await governmentService.verifyIntervention(caseId, decision);
        showToast({
          title: decision === "verified" ? "Intervención verificada" : "Intervención devuelta",
          detail:
            decision === "verified"
              ? "La verificación ciudadana del cierre sigue siendo independiente."
              : "Se solicitó una corrección al especialista.",
          tone: decision === "verified" ? "success" : "warning",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const publishOutcome = useCallback(
    async (caseId: string, outcome: string) => {
      requirePermission("outcome:publish", cases.find((item) => item.id === caseId));
      try {
        await governmentService.publishOutcome(caseId, outcome);
        showToast({
          title: "Resultado publicado",
          detail: coreMode
            ? "Publicación local etiquetada; no altera el registro oficial importado."
            : "El cierre ya es visible en la experiencia ciudadana de muestra.",
          tone: "success",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const uploadEvidence = useCallback(
    async (id: string, input: GovernmentEvidenceInput) => {
      requirePermission("evidence:upload", cases.find((item) => item.id === id));
      try {
        const record = await governmentService.uploadGovernmentEvidence(id, input);
        showToast({
          title: "Evidencia de gobierno cargada",
          detail: "El archivo quedó vinculado al operador, área y fecha de intervención.",
          tone: "success",
        });
        return record;
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const recordCompletion = useCallback(
    async (id: string, input: CompletionClaimInput) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      try {
        const claim = await governmentService.recordCompletionClaim(id, input);
        showToast({
          title: "Cierre operativo registrado",
          detail:
            "La verificación ciudadana y el registro oficial importado conservan su propio estado.",
          tone: "success",
        });
        return claim;
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const respondDispute = useCallback(
    async (id: string, input: DisputeResponseInput) => {
      requirePermission("dispute:respond", cases.find((item) => item.id === id));
      try {
        await governmentService.respondToDispute(id, input);
        showToast({
          title: "Respuesta enviada a la ciudadanía",
          detail: coreMode
            ? "Respuesta local etiquetada; el estado de verificación ciudadana no cambia."
            : "La disputa sigue abierta hasta que la comunidad actualice su verificación.",
          tone: "info",
        });
      } catch (cause) {
        showError(cause);
        throw cause;
      }
    },
    [cases, requirePermission, showError, showToast],
  );

  const resetMockData = useCallback(() => {
    if (coreMode) {
      showToast({
        title: "No disponible en modo núcleo",
        detail: "Los datos provienen de la API de Session 1 y no se restablecen desde la consola.",
        tone: "warning",
      });
      return;
    }
    if (!currentUser.permissions.includes("settings:reset")) {
      showToast({
        title: "Acción no permitida",
        detail: "Sólo la cuenta de coordinación puede restablecer la muestra.",
        tone: "warning",
      });
      return;
    }
    governmentService.resetMockData?.();
    showToast({
      title: "Datos de muestra restablecidos",
      detail: "Las acciones locales volvieron a su estado inicial.",
      tone: "info",
    });
  }, [currentUser, showToast]);

  const demoUsers = useMemo(
    () => (coreMode ? (currentUser.isDemo ? [...mockDemoUsers, currentUser] : [currentUser]) : mockDemoUsers),
    [currentUser],
  );

  const value = useMemo<GovernmentContextValue>(
    () => ({
      cases,
      loading,
      currentUser,
      demoUsers,
      operatorRoster: coreMode
        ? mockDemoUsers.filter((user) => user.role === "department_operator")
        : mockDemoUsers,
      switchDemoUser,
      can,
      permissionReason,
      toast,
      dismissToast: () => setToast(null),
      refresh,
      retry,
      updatePriority,
      updateStatus,
      assignDepartment,
      assignOperator,
      uploadEvidence,
      recordCompletion,
      respondDispute,
      authorizeDispatch,
      advanceDispatch,
      verifyIntervention,
      publishOutcome,
      getDashboard: () => governmentService.getDashboard(),
      getPreventiveSignals: () => governmentService.getPreventiveSignals(),
      getDispatchOrder: (caseId) => governmentService.getDispatchOrder(caseId),
      getDispatchRecommendations: (caseId) =>
        governmentService.getDispatchRecommendations(caseId),
      getCaseAnalysis: (caseId) => governmentService.getCaseAnalysis(caseId),
      resetMockData,
      dataSource,
      availability,
      error,
      authenticated,
      organizations,
      pendingContracts: coreMode ? PENDING_CONTRACTS : [],
      isDemoEnvironment: !coreMode || currentUser.isDemo,
    }),
    [
      cases,
      loading,
      currentUser,
      demoUsers,
      switchDemoUser,
      can,
      permissionReason,
      toast,
      refresh,
      retry,
      updatePriority,
      updateStatus,
      assignDepartment,
      assignOperator,
      uploadEvidence,
      recordCompletion,
      respondDispute,
      authorizeDispatch,
      advanceDispatch,
      verifyIntervention,
      publishOutcome,
      resetMockData,
      availability,
      error,
      authenticated,
      organizations,
    ],
  );

  return (
    <GovernmentContext.Provider value={value}>
      {children}
      {toast ? <GovernmentToast toast={toast} onClose={() => setToast(null)} /> : null}
    </GovernmentContext.Provider>
  );
}

function GovernmentToast({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  return (
    <div className={`gov-toast gov-toast--${toast.tone}`} role="status">
      <span className="gov-toast__dot" />
      <div>
        <strong>{toast.title}</strong>
        {toast.detail ? <p>{toast.detail}</p> : null}
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  );
}

export function useGovernment(): GovernmentContextValue {
  const value = useContext(GovernmentContext);
  if (!value) {
    throw new Error("useGovernment debe usarse dentro de GovernmentProvider");
  }
  return value;
}
