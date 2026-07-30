import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className ?? ""}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "accent",
  hint,
}: {
  label: string;
  value: string;
  tone?: "accent" | "success" | "danger";
  hint?: string;
}) {
  const dot = { accent: "bg-accent", success: "bg-success", danger: "bg-danger" }[tone];
  const valueColor = { accent: "text-fg", success: "text-success", danger: "text-danger" }[tone];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">{label}</p>
      </div>
      <p className={`mt-2.5 text-2xl font-bold tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-soft">{hint}</p> : null}
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const isReceita = type === "receita";
  return (
    <span className={`badge ${isReceita ? "text-success" : "text-danger"}`} style={{ background: isReceita ? "var(--success-soft)" : "var(--danger-soft)" }}>
      <span className={`h-1.5 w-1.5 rounded-full ${isReceita ? "bg-success" : "bg-danger"}`} aria-hidden />
      {isReceita ? "Receita" : "Despesa"}
    </span>
  );
}

export function Avatar({ name }: { name?: string | null }) {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-accent"
      style={{ background: "var(--accent-soft)" }}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 p-10 text-center">
      <p className="font-semibold text-fg">{title}</p>
      {hint ? <p className="text-sm text-soft">{hint}</p> : null}
    </div>
  );
}
