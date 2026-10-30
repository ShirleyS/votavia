"use client";

import Link from "next/link";
import { ArrowRight, Inbox, type LucideIcon } from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/government/display";
import type {
  CaseCategory,
  CasePriority,
  CaseStatus,
  GovernmentCase,
} from "@/lib/government/types";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`gov-logo ${compact ? "gov-logo--compact" : ""}`}>
      <span className="gov-logo__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact ? (
        <span className="gov-logo__word">
          Vota<span>Vía</span>
        </span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-badge__dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: CasePriority;
  compact?: boolean;
}) {
  return (
    <span
      className={`priority-badge priority-badge--${priority} ${
        compact ? "priority-badge--compact" : ""
      }`}
    >
      <span className="priority-badge__bar" aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: CaseCategory }) {
  return (
    <span className="category-badge">
      <span
        className="category-badge__dot"
        style={{ background: CATEGORY_COLORS[category] }}
      />
      {CATEGORY_SHORT_LABELS[category]}
    </span>
  );
}

export function InitialsAvatar({
  initials,
  tone = "blue",
  size = "md",
}: {
  initials: string;
  tone?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`initials-avatar initials-avatar--${tone} initials-avatar--${size}`}>
      {initials}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
  href,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  tone?: "blue" | "amber" | "red" | "green" | "violet" | "slate";
  href?: string;
}) {
  const content = (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top">
        <span className="metric-card__icon">
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <span className="metric-card__detail">{detail}</span>
      </div>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__label">{label}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="metric-card-link">
      {content}
    </Link>
  ) : (
    content
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="section-title__action">{action}</div> : null}
    </div>
  );
}

export function CaseLink({
  item,
  showArrow = true,
}: {
  item: GovernmentCase;
  showArrow?: boolean;
}) {
  return (
    <Link href={`/gobierno/reportes/${item.id}`} className="case-link">
      <span>{item.folio}</span>
      {showArrow ? <ArrowRight size={14} /> : null}
    </Link>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Inbox size={22} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "blue",
  label,
}: {
  value: number;
  tone?: "blue" | "green" | "amber" | "red";
  label?: string;
}) {
  return (
    <div className={`progress progress--${tone}`}>
      {label ? (
        <div className="progress__meta">
          <span>{label}</span>
          <span>{value}%</span>
        </div>
      ) : null}
      <div className="progress__track">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function SampleBadge({ children = "Datos de muestra" }: { children?: React.ReactNode }) {
  const { dataSource } = useGovernment();
  const neutral =
    children === "Datos de muestra" || children === "Datos ficticios";
  if (dataSource === "core" && neutral) return null;
  return (
    <span className="sample-badge">
      <span className="sample-badge__dot" />
      {children}
    </span>
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-card" aria-label="Cargando información">
      <span className="skeleton skeleton--title" />
      {Array.from({ length: lines }).map((_, index) => (
        <span className="skeleton" key={index} />
      ))}
    </div>
  );
}
