"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Clock3,
  Inbox,
  MapPin,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { teamMembers } from "@/lib/government/mock-data";
import type { GovernmentCase } from "@/lib/government/types";
import { useGovernment } from "./GovernmentProvider";
import {
  CategoryBadge,
  InitialsAvatar,
  MetricCard,
  PriorityBadge,
  ProgressBar,
  SampleBadge,
  StatusBadge,
} from "./ui";

type TeamMember = (typeof teamMembers)[number];

interface TeamProfile {
  memberId: string;
  departmentId?: string;
  capacity: number;
  scopeLabel: string;
  match: (item: GovernmentCase) => boolean;
}

const profiles: TeamProfile[] = [
  {
    memberId: "tm-1",
    capacity: 18,
    scopeLabel: "Revisión, prioridad y coordinación de la mesa",
    match: (item) => ["reported", "under_review"].includes(item.status),
  },
  {
    memberId: "tm-2",
    departmentId: "obras",
    capacity: 16,
    scopeLabel: "Obras, pavimento y espacio público",
    match: (item) => item.departmentId === "obras",
  },
  {
    memberId: "tm-3",
    departmentId: "agua",
    capacity: 14,
    scopeLabel: "Agua potable y red secundaria",
    match: (item) => item.departmentId === "agua",
  },
  {
    memberId: "tm-4",
    capacity: 15,
    scopeLabel: "Evidencia, cierre técnico y verificación",
    match: (item) => item.status === "pending_verification",
  },
  {
    memberId: "tm-5",
    departmentId: "movilidad",
    capacity: 12,
    scopeLabel: "Movilidad, señalización y accesibilidad",
    match: (item) => item.departmentId === "movilidad",
  },
];

const specialistPartners = [
  { name: "Brigadas Delta", area: "Obras y pavimento", initials: "BD" },
  { name: "Aguas Urbanas MX", area: "Red secundaria", initials: "AU" },
  { name: "Lux Urbano", area: "Alumbrado público", initials: "LU" },
];

export function TeamView() {
  const { cases, loading } = useGovernment();
  const openCases = cases.filter((item) => !["resolved", "closed"].includes(item.status));

  const rows = profiles.map((profile) => {
    const member = teamMembers.find((item) => item.id === profile.memberId) as TeamMember;
    const scoped = cases.filter(profile.match);
    const active = scoped.filter((item) => !["resolved", "closed"].includes(item.status));
    const resolved = scoped.filter((item) => ["resolved", "closed"].includes(item.status));
    return {
      member,
      profile,
      scoped: active.slice(0, 3),
      activeCount: active.length,
      resolvedCount: resolved.length + member.resolved,
      capacity: Math.min(100, Math.round((member.active / profile.capacity) * 100)),
    };
  });

  const online = teamMembers.filter((member) => member.status === "En línea").length;
  const averageLoad = Math.round(rows.reduce((sum, row) => sum + row.capacity, 0) / rows.length);
  const accompaniedClosures = rows.reduce((sum, row) => sum + row.resolvedCount, 0);
  const pendingReview = cases.filter((item) => ["reported", "under_review"].includes(item.status)).length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Mesa de gobierno</span>
            <SampleBadge />
          </div>
          <h1>Equipo operativo</h1>
          <p>Quién atiende cada flujo, cuánta carga tiene y qué expedientes requieren seguimiento hoy.</p>
        </div>
        <Link href="/gobierno/reportes" className="button button--primary">
          <Inbox size={16} /> Abrir bandeja
        </Link>
      </div>

      <div className="team-note">
        <span className="team-note__icon"><ShieldCheck size={19} /></span>
        <div>
          <strong>La asignación final siempre es humana</strong>
          <p>La carga se calcula con los reportes de muestra de este navegador. Ningún cambio de equipo modifica personal, permisos ni datos reales.</p>
        </div>
        <span className="team-note__tag">Operación local</span>
      </div>

      <div className="metric-grid team-metrics">
        <MetricCard label="Personas en la mesa" value={teamMembers.length} detail={`${online} disponibles ahora`} icon={Users} tone="blue" />
        <MetricCard label="Reportes abiertos" value={openCases.length} detail="En el conjunto de muestra" icon={Inbox} tone="amber" />
        <MetricCard label="Por revisar" value={pendingReview} detail="Requieren criterio de la mesa" icon={Clock3} tone="red" />
        <MetricCard label="Cierres acompañados" value={accompaniedClosures} detail="Acumulado de referencia" icon={BadgeCheck} tone="green" />
      </div>

      <div className="team-layout">
        <section className="panel team-roster">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Responsabilidades</span>
              <h2>Integrantes y carga de trabajo</h2>
              <p>Cada tarjeta combina el rol de la mesa con los casos abiertos de la muestra.</p>
            </div>
            <span className="team-roster__stamp"><span /> Datos de muestra</span>
          </div>

          {loading ? (
            <div className="team-member-list">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="skeleton-card" key={index}><span className="skeleton skeleton--title" /><span className="skeleton" /><span className="skeleton" /></div>
              ))}
            </div>
          ) : (
            <div className="team-member-list">
              {rows.map(({ member, profile, scoped, activeCount, resolvedCount, capacity }) => (
                <article className="team-member" key={member.id}>
                  <div className="team-member__identity">
                    <InitialsAvatar initials={member.initials} tone={member.color} size="lg" />
                    <div>
                      <div className="team-member__top">
                        <strong>{member.name}</strong>
                        <span className={`team-status team-status--${statusTone(member.status)}`}><i /> {member.status}</span>
                      </div>
                      <span className="team-member__role">{member.role}</span>
                      <p>{profile.scopeLabel}</p>
                    </div>
                  </div>

                  <div className="team-member__numbers">
                    <div><strong>{activeCount}</strong><span>abiertos ahora</span></div>
                    <div><strong>{resolvedCount}</strong><span>cierres acompañados</span></div>
                    <div><strong>{capacity}%</strong><span>de capacidad</span></div>
                  </div>

                  <div className="team-member__workload">
                    <ProgressBar value={capacity} tone={capacity > 85 ? "red" : capacity > 65 ? "amber" : "green"} label="Carga de la mesa" />
                  </div>

                  <div className="team-member__cases">
                    <span className="team-member__cases-label">Trabajo visible</span>
                    {scoped.length > 0 ? (
                      scoped.map((item) => (
                        <Link href={`/gobierno/reportes/${item.id}`} className="team-case-row" key={item.id}>
                          <span className="team-case-row__folio">{item.folio}</span>
                          <div>
                            <strong>{item.title}</strong>
                            <span><MapPin size={12} /> {item.colonia}</span>
                          </div>
                          <div className="team-case-row__meta">
                            <PriorityBadge priority={item.priority} compact />
                            <StatusBadge status={item.status} />
                          </div>
                          <ArrowRight size={14} />
                        </Link>
                      ))
                    ) : (
                      <p className="team-member__empty">Sin expedientes abiertos en este flujo dentro de la muestra.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="team-aside">
          <section className="panel team-capacity">
            <div className="panel__head">
              <div><span className="eyebrow">Balance del turno</span><h2>Capacidad de la mesa</h2></div>
              <span className="team-capacity__score">{averageLoad}%</span>
            </div>
            <div className="team-capacity__ring" style={{ "--load": `${averageLoad}%` } as React.CSSProperties}>
              <div><strong>{averageLoad}%</strong><span>carga media</span></div>
            </div>
            <div className="team-capacity__legend">
              <span><i className="is-green" /> Holgura operativa</span>
              <span><i className="is-amber" /> Seguimiento cercano</span>
              <span><i className="is-red" /> Requiere reasignar</span>
            </div>
            <p className="team-capacity__note">La carga es una referencia de la mesa, no una evaluación de desempeño individual.</p>
          </section>

          <section className="panel team-focus">
            <div className="panel__head">
              <div><span className="eyebrow">Prioridad del turno</span><h2>Enfoque sugerido</h2></div>
              <UserCheck size={18} />
            </div>
            <div className="team-focus__item"><span>01</span><div><strong>Revisar reportes sin área</strong><p>{cases.filter((item) => !item.departmentId && !["resolved", "closed"].includes(item.status)).length} expedientes esperan asignación.</p></div></div>
            <div className="team-focus__item"><span>02</span><div><strong>Verificar evidencia pendiente</strong><p>{cases.filter((item) => item.status === "pending_verification").length} casos requieren una decisión humana.</p></div></div>
            <div className="team-focus__item"><span>03</span><div><strong>Publicar cierres resueltos</strong><p>{cases.filter((item) => item.status === "resolved").length} resultados están listos para comunicar.</p></div></div>
            <Link href="/gobierno/reportes" className="text-link">Abrir trabajo sin asignar <ArrowRight size={13} /></Link>
          </section>

          <section className="panel team-partners">
            <div className="panel__head">
              <div><span className="eyebrow">Especialistas aprobados</span><h2>Apoyo operativo</h2></div>
              <BriefcaseBusiness size={18} />
            </div>
            <div className="team-partner-list">
              {specialistPartners.map((partner) => (
                <div className="team-partner" key={partner.name}>
                  <InitialsAvatar initials={partner.initials} tone="slate" size="sm" />
                  <div><strong>{partner.name}</strong><span>{partner.area}</span></div>
                  <span className="team-partner__ok"><BadgeCheck size={13} /> Aprobado</span>
                </div>
              ))}
            </div>
            <p className="team-partners__note">Proveedores de muestra. Autorizar trabajo desde un expediente no crea una orden real.</p>
          </section>
        </aside>
      </div>

      <div className="sample-data-footer">
        <SampleBadge>Datos de muestra</SampleBadge>
        <p>Carga, disponibilidad y nombres son ficticios y se calculan localmente con los reportes de demostración.</p>
      </div>
    </div>
  );
}

function statusTone(status: string): "online" | "field" | "review" | "offline" {
  if (status === "En línea") return "online";
  if (status === "En campo") return "field";
  if (status === "Revisando evidencia") return "review";
  return "offline";
}
