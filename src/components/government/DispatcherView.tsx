"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  Clock,
  HardHat,
  MapPin,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { EmptyState, MetricCard, SectionTitle } from "./ui";
import { formatDate } from "@/lib/government/display";
import type { DispatchBoardItem, DispatchState, GovernmentCase } from "@/lib/government/types";

/**
 * Tablero de despacho: una sola vista para todas las órdenes de trabajo, en
 * lugar de entrar caso por caso. Cada columna es un estado del despacho y cada
 * tarjeta avanza con la transición permitida por el núcleo.
 */
const COLUMNS: Array<{
  id: string;
  label: string;
  hint: string;
  states: DispatchState[];
  tone: string;
  icon: typeof CircleDashed;
}> = [
  {
    id: "queue",
    label: "Por autorizar",
    hint: "Sin especialista en campo",
    states: ["recommended", "authorized"],
    tone: "slate",
    icon: CircleDashed,
  },
  {
    id: "accepted",
    label: "Aceptado",
    hint: "El especialista confirmó",
    states: ["accepted"],
    tone: "blue",
    icon: BadgeCheck,
  },
  {
    id: "scheduled",
    label: "Programado",
    hint: "Visita agendada",
    states: ["scheduled"],
    tone: "violet",
    icon: Clock,
  },
  {
    id: "field",
    label: "En campo",
    hint: "Trabajo iniciado",
    states: ["in_progress"],
    tone: "amber",
    icon: Truck,
  },
  {
    id: "review",
    label: "En revisión",
    hint: "Espera verificación",
    states: ["completed"],
    tone: "green",
    icon: HardHat,
  },
  {
    id: "closed",
    label: "Cerrado",
    hint: "Verificado o devuelto",
    states: ["verified", "returned"],
    tone: "slate",
    icon: CircleCheck,
  },
];

const NEXT_STEP: Partial<Record<DispatchState, { state: DispatchState; label: string }>> = {
  recommended: { state: "authorized", label: "Autorizar" },
  authorized: { state: "accepted", label: "Marcar aceptado" },
  accepted: { state: "scheduled", label: "Programar" },
  scheduled: { state: "in_progress", label: "Iniciar trabajo" },
  in_progress: { state: "completed", label: "Enviar a revisión" },
  completed: { state: "verified", label: "Verificar" },
};

export function DispatcherView() {
  const { cases, listDispatchBoard, advanceDispatch, can, permissionReason } = useGovernment();
  const [items, setItems] = useState<DispatchBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const board = await listDispatchBoard();
      setItems(board);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer el tablero de despacho.");
    } finally {
      setLoading(false);
    }
  }, [listDispatchBoard]);

  // Load once on mount: `load` is a pure service call, so it is safe to depend on.
  useEffect(() => {
    let active = true;
    void listDispatchBoard()
      .then((board) => {
        if (active) {
          setItems(board);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "No se pudo leer el tablero de despacho.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listDispatchBoard]);

  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);

  const byColumn = useMemo(() => {
    const groups = new Map<string, DispatchBoardItem[]>();
    COLUMNS.forEach((column) => groups.set(column.id, []));
    items.forEach((item) => {
      const column = COLUMNS.find((entry) => entry.states.includes(item.state));
      if (column) groups.get(column.id)!.push(item);
    });
    return groups;
  }, [items]);

  const inField = items.filter((item) => item.state === "in_progress").length;
  const waiting = items.filter(
    (item) => item.state === "recommended" || item.state === "authorized",
  ).length;
  const review = items.filter((item) => item.state === "completed").length;

  const advance = async (item: DispatchBoardItem) => {
    const next = NEXT_STEP[item.state];
    if (!next) return;
    setBusy(item.assignmentId);
    try {
      await advanceDispatch(item.caseId, next.state);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const canDispatch = (facility?: GovernmentCase) => can("dispatch:authorize", facility);

  return (
    <div className="dispatcher">
      <SectionTitle
        eyebrow="Despacho"
        title="Tablero de especialistas"
        subtitle="Todas las órdenes de trabajo del núcleo, agrupadas por estado."
      />

      <div className="metric-grid">
        <MetricCard
          label="En campo"
          value={inField}
          detail="Especialistas trabajando ahora"
          icon={Truck}
          tone="amber"
        />
        <MetricCard
          label="Por autorizar"
          value={waiting}
          detail="Órdenes sin despachar"
          icon={CircleDashed}
          tone="blue"
        />
        <MetricCard
          label="En revisión"
          value={review}
          detail="Esperando verificación"
          icon={HardHat}
          tone="green"
        />
        <MetricCard
          label="Total de órdenes"
          value={items.length}
          detail="Registradas en el núcleo"
          icon={BadgeCheck}
          tone="violet"
        />
      </div>

      {error ? (
        <div className="gov-service-banner gov-service-banner--error" role="alert">
          <strong>No se pudo leer el despacho</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="dispatch-board__loading">Cargando órdenes de despacho…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Todavía no hay órdenes de despacho"
          detail="Abre un reporte y autoriza a un especialista desde la sección de Despacho del expediente."
          action={
            <Link className="button button--primary button--small" href="/gobierno/reportes">
              Ver reportes <ArrowRight size={14} />
            </Link>
          }
        />
      ) : (
        <div className="dispatch-board" role="list">
          {COLUMNS.map((column) => {
            const columnItems = byColumn.get(column.id) ?? [];
            const Icon = column.icon;
            return (
              <section
                key={column.id}
                className={`dispatch-board__column dispatch-board__column--${column.tone}`}
                role="listitem"
                aria-label={column.label}
              >
                <header className="dispatch-board__head">
                  <span className="dispatch-board__icon">
                    <Icon size={15} />
                  </span>
                  <div>
                    <strong>{column.label}</strong>
                    <span>{column.hint}</span>
                  </div>
                  <em>{columnItems.length}</em>
                </header>

                <div className="dispatch-board__stack">
                  {columnItems.length === 0 ? (
                    <p className="dispatch-board__empty">Sin órdenes</p>
                  ) : (
                    columnItems.map((item) => {
                      const facility = caseById.get(item.caseId);
                      const next = NEXT_STEP[item.state];
                      const allowed = canDispatch(facility);
                      return (
                        <article className="dispatch-card" key={item.assignmentId}>
                          <div className="dispatch-card__top">
                            <Link href={`/gobierno/reportes/${item.caseId}`}>
                              {facility?.title ?? "Expediente sin título"}
                            </Link>
                            <span className="dispatch-card__folio">
                              {facility?.folio ?? item.caseId.slice(0, 8)}
                            </span>
                          </div>
                          <div className="dispatch-card__meta">
                            <span>
                              <HardHat size={12} /> {item.specialistName}
                            </span>
                            {facility?.colonia ? (
                              <span>
                                <MapPin size={12} /> {facility.colonia}
                              </span>
                            ) : null}
                          </div>
                          <div className="dispatch-card__foot">
                            <span className="dispatch-card__time">
                              {formatDate(item.updatedAt, true)}
                            </span>
                            {next ? (
                              <button
                                type="button"
                                className="button button--primary button--tiny"
                                disabled={!allowed || busy === item.assignmentId}
                                title={allowed ? undefined : permissionReason("dispatch:authorize", facility) ?? undefined}
                                onClick={() => void advance(item)}
                              >
                                {busy === item.assignmentId ? (
                                  <span className="button-spinner" />
                                ) : item.state === "completed" ? (
                                  <BadgeCheck size={12} />
                                ) : (
                                  <ArrowRight size={12} />
                                )}
                                {next.label}
                              </button>
                            ) : item.state === "returned" ? (
                              <span className="dispatch-card__flag">
                                <RotateCcw size={12} /> Devuelto
                              </span>
                            ) : (
                              <span className="dispatch-card__flag">Completado</span>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
