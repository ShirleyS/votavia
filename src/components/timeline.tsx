import {
  BadgeCheck,
  CircleDot,
  ClipboardList,
  Clock3,
  FileCheck2,
  HardHat,
  MessageSquarePlus,
  Search,
  ThumbsUp,
  Truck,
  Wrench,
} from "lucide-react";
import type { CaseTimelineEvent, CaseEventType } from "@/shared/votavia-contract";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const EVENT_META: Record<
  CaseEventType,
  { icon: typeof CircleDot; tone: string; label: string }
> = {
  reported: { icon: ClipboardList, tone: "bg-royal-600 text-white", label: "Reporte recibido" },
  under_review: { icon: Search, tone: "bg-amber-100 text-amber-800", label: "En revisión" },
  assigned: { icon: Truck, tone: "bg-violet-100 text-violet-800", label: "Asignado" },
  in_progress: { icon: HardHat, tone: "bg-blue-100 text-blue-800", label: "En proceso" },
  pending_verification: { icon: FileCheck2, tone: "bg-sky-100 text-sky-800", label: "Por verificar" },
  resolved: { icon: BadgeCheck, tone: "bg-emerald-100 text-emerald-800", label: "Resuelto" },
  closed: { icon: Clock3, tone: "bg-slate-200 text-slate-700", label: "Cerrado" },
  community_support: { icon: ThumbsUp, tone: "bg-royal-50 text-royal-700", label: "Apoyo de la comunidad" },
  observation: { icon: MessageSquarePlus, tone: "bg-navy-50 text-navy-700", label: "Observación" },
  government_update: { icon: Wrench, tone: "bg-teal-100 text-teal-800", label: "Actualización de gobierno" },
  evidence_added: { icon: FileCheck2, tone: "bg-teal-100 text-teal-800", label: "Evidencia publicada" },
  dispatch_update: { icon: Wrench, tone: "bg-violet-100 text-violet-800", label: "Cuadrilla" },
};

const ACTOR_LABEL: Record<string, string> = {
  citizen: "Vecina o vecino",
  community: "Comunidad",
  government: "Equipo de gobierno",
  specialist: "Especialista autorizado",
  system: "VotaVía",
};

export function Timeline({
  events,
  emptyMessage = "Todavía no hay movimientos registrados.",
}: {
  events: CaseTimelineEvent[];
  emptyMessage?: string;
}) {
  if (!events.length) {
    return <p className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-500">{emptyMessage}</p>;
  }

  return (
    <ol className="relative space-y-5">
      <span className="absolute bottom-4 left-[19px] top-4 w-px bg-line" aria-hidden />
      {events.map((event) => {
        const meta = EVENT_META[event.type] ?? {
          icon: CircleDot,
          tone: "bg-navy-100 text-navy-700",
          label: event.type,
        };
        const Icon = meta.icon;
        const specialist =
          event.metadata && typeof event.metadata.specialist_display_name === "string"
            ? event.metadata.specialist_display_name
            : null;
        return (
          <li key={event.event_id} className="relative flex gap-3.5">
            <span
              className={cn(
                "relative z-10 mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                meta.tone,
              )}
              aria-hidden
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-bold text-navy-900">{event.title}</p>
                <span className="text-[11px] font-medium uppercase tracking-wide text-navy-500">
                  {ACTOR_LABEL[event.actor_type] ?? event.actor_type}
                </span>
              </div>
              {event.description ? (
                <p className="mt-1 text-sm leading-relaxed text-navy-500">{event.description}</p>
              ) : null}
              {specialist ? (
                <p className="mt-1 text-xs font-medium text-navy-700">Especialista: {specialist}</p>
              ) : null}
              <time
                dateTime={event.created_at}
                className="mt-1 block text-[11px] tabular-nums text-navy-500"
              >
                {formatDateTime(event.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
