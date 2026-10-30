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
import { governmentService } from "@/lib/government/mock-service";
import type {
  CasePriority,
  CaseStatus,
  CompletionClaim,
  CompletionClaimInput,
  DemoUser,
  DisputeResponseInput,
  DispatchState,
  GovernmentCase,
  GovernmentEvidenceInput,
  GovernmentEvidenceRecord,
  GovernmentPermission,
} from "@/lib/government/types";

const DEMO_USER_KEY = "votavia-government-demo-user-v1";

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
  if (!item || !user.departmentId) return true;
  return item.departmentId === user.departmentId;
}

function permissionError(
  user: DemoUser,
  permission: GovernmentPermission,
  item?: GovernmentCase,
): string | null {
  if (!user.permissions.includes(permission)) {
    return `${user.name} no tiene permiso para esta acción en la cuenta de demostración.`;
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
  switchDemoUser: (id: string) => void;
  can: (permission: GovernmentPermission, item?: GovernmentCase) => boolean;
  permissionReason: (
    permission: GovernmentPermission,
    item?: GovernmentCase,
  ) => string | null;
  toast: Toast | null;
  dismissToast: () => void;
  refresh: () => Promise<void>;
  updatePriority: (id: string, priority: CasePriority) => Promise<void>;
  updateStatus: (id: string, status: CaseStatus) => Promise<void>;
  assignDepartment: (id: string, departmentId: string) => Promise<void>;
  assignOperator: (id: string, operatorId: string) => Promise<void>;
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
  resetMockData: () => void;
}

const GovernmentContext = createContext<GovernmentContextValue | null>(null);

export function GovernmentProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<GovernmentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [currentUser, setCurrentUser] = useState<DemoUser>(initialDemoUser);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: Omit<Toast, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...next, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const refresh = useCallback(async () => {
    const next = await governmentService.listCases();
    setCases(next);
    setLoading(false);
  }, []);

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
      const error = permissionError(currentUser, permission, item);
      if (error) throw new Error(error);
    },
    [currentUser],
  );

  const switchDemoUser = useCallback(
    (id: string) => {
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
    void refresh();
    return governmentService.subscribe(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const updatePriority = useCallback(
    async (id: string, priority: CasePriority) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      await governmentService.updateCasePriority(id, priority);
      showToast({
        title: "Prioridad actualizada",
        detail: "El cambio ya se refleja en todas las vistas de muestra.",
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const updateStatus = useCallback(
    async (id: string, status: CaseStatus) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      await governmentService.updateCaseStatus(id, status);
      showToast({
        title: "Estado del caso actualizado",
        detail: "La bitácora del caso registró el cambio.",
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const assignDepartment = useCallback(
    async (id: string, departmentId: string) => {
      requirePermission("case:assign", cases.find((item) => item.id === id));
      await governmentService.assignDepartment(id, departmentId);
      showToast({
        title: "Departamento asignado",
        detail: "El caso ya tiene un área responsable en el modo de muestra.",
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const assignOperator = useCallback(
    async (id: string, operatorId: string) => {
      const item = cases.find((entry) => entry.id === id);
      requirePermission("case:assign", item);
      const operator = mockDemoUsers.find((user) => user.id === operatorId);
      if (!operator) throw new Error("No encontramos al operador de demostración.");
      if (operator.departmentId && item?.departmentId !== operator.departmentId) {
        throw new Error(
          "El operador debe pertenecer al área responsable del caso.",
        );
      }
      await governmentService.assignOperator(
        id,
        operator.id,
        operator.name,
      );
      showToast({
        title: "Responsable operativo asignado",
        detail: `${operator.name} quedó a cargo del seguimiento del caso.`,
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const authorizeDispatch = useCallback(
    async (caseId: string, specialistName: string, specialistId: string) => {
      requirePermission(
        "dispatch:authorize",
        cases.find((item) => item.id === caseId),
      );
      await governmentService.authorizeDispatch(caseId, specialistId);
      showToast({
        title: "Despacho autorizado",
        detail: `${specialistName} recibió una orden de trabajo simulada.`,
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const advanceDispatch = useCallback(
    async (caseId: string, state: DispatchState) => {
      requirePermission("case:manage", cases.find((item) => item.id === caseId));
      await governmentService.advanceDispatch(caseId, state);
      showToast({
        title: "Orden de trabajo actualizada",
        detail: "El avance quedó registrado en la bitácora del caso.",
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const verifyIntervention = useCallback(
    async (caseId: string, decision: "verified" | "returned") => {
      requirePermission("case:manage", cases.find((item) => item.id === caseId));
      await governmentService.verifyIntervention(caseId, decision);
      showToast({
        title:
          decision === "verified"
            ? "Intervención verificada"
            : "Intervención devuelta",
        detail:
          decision === "verified"
            ? "El caso pasó a resuelto. Aún falta publicar el resultado."
            : "Se solicitó una corrección al especialista.",
        tone: decision === "verified" ? "success" : "warning",
      });
    },
    [cases, requirePermission, showToast],
  );

  const publishOutcome = useCallback(
    async (caseId: string, outcome: string) => {
      requirePermission(
        "outcome:publish",
        cases.find((item) => item.id === caseId),
      );
      await governmentService.publishOutcome(caseId, outcome);
      showToast({
        title: "Resultado publicado",
        detail: "El cierre ya es visible en la experiencia ciudadana de muestra.",
        tone: "success",
      });
    },
    [cases, requirePermission, showToast],
  );

  const uploadEvidence = useCallback(
    async (id: string, input: GovernmentEvidenceInput) => {
      requirePermission("evidence:upload", cases.find((item) => item.id === id));
      const record = await governmentService.uploadGovernmentEvidence(id, input);
      showToast({
        title: "Evidencia de gobierno cargada",
        detail: "El archivo quedó vinculado al operador, área y fecha de intervención.",
        tone: "success",
      });
      return record;
    },
    [cases, requirePermission, showToast],
  );

  const recordCompletion = useCallback(
    async (id: string, input: CompletionClaimInput) => {
      requirePermission("case:manage", cases.find((item) => item.id === id));
      const claim = await governmentService.recordCompletionClaim(id, input);
      showToast({
        title: "Cierre operativo registrado",
        detail:
          "La verificación ciudadana y el registro oficial importado conservan su propio estado.",
        tone: "success",
      });
      return claim;
    },
    [cases, requirePermission, showToast],
  );

  const respondDispute = useCallback(
    async (id: string, input: DisputeResponseInput) => {
      requirePermission("dispute:respond", cases.find((item) => item.id === id));
      await governmentService.respondToDispute(id, input);
      showToast({
        title: "Respuesta enviada a la ciudadanía",
        detail:
          "La disputa sigue abierta hasta que la comunidad actualice su verificación.",
        tone: "info",
      });
    },
    [cases, requirePermission, showToast],
  );

  const resetMockData = useCallback(() => {
    if (!currentUser.permissions.includes("settings:reset")) {
      showToast({
        title: "Acción no permitida",
        detail: "Sólo la cuenta de coordinación puede restablecer la muestra.",
        tone: "warning",
      });
      return;
    }
    governmentService.resetMockData();
    showToast({
      title: "Datos de muestra restablecidos",
      detail: "Las acciones locales volvieron a su estado inicial.",
      tone: "info",
    });
  }, [currentUser, showToast]);

  const value = useMemo<GovernmentContextValue>(
    () => ({
      cases,
      loading,
      currentUser,
      demoUsers: mockDemoUsers,
      switchDemoUser,
      can,
      permissionReason,
      toast,
      dismissToast: () => setToast(null),
      refresh,
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
    }),
    [
      cases,
      loading,
      currentUser,
      switchDemoUser,
      can,
      permissionReason,
      toast,
      refresh,
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
