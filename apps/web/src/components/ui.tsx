import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className ?? ""}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "navy",
  hint,
}: {
  label: string;
  value: string;
  tone?: "navy" | "gold" | "success" | "danger";
  hint?: string;
}) {
  const bar = {
    navy: "bg-navy-700",
    gold: "bg-gold-500",
    success: "bg-success",
    danger: "bg-danger",
  }[tone];
  const valueColor = {
    navy: "text-navy-800",
    gold: "text-gold-700",
    success: "text-success",
    danger: "text-danger",
  }[tone];
  return (
    <div className="card relative overflow-hidden p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const isReceita = type === "receita";
  return (
    <span className={`badge ${isReceita ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isReceita ? "bg-success" : "bg-danger"}`} aria-hidden />
      {isReceita ? "Receita" : "Despesa"}
    </span>
  );
}

export function Avatar({ name }: { name?: string | null }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-700 ring-1 ring-inset ring-navy-200">
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 border-dashed p-10 text-center">
      <p className="font-semibold text-navy-700">{title}</p>
      {hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}
