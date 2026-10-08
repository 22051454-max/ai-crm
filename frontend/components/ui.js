"use client";
import { STAGE_COLORS } from "@/lib/api";

export function StageBadge({ stage }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STAGE_COLORS[stage] || ""}`}>{stage}</span>;
}

export function HealthBadge({ health }) {
  const c = health.label === "healthy" ? "bg-emerald-100 text-emerald-700" : health.label === "at risk" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{health.score} · {health.label}</span>;
}

export function Prob({ p }) {
  const pct = Math.round(p * 100);
  const color = pct >= 50 ? "bg-emerald-500" : pct >= 25 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded bg-slate-200"><div className={`h-1.5 rounded ${color}`} style={{ width: pct + "%" }} /></div>
      <span className="text-xs text-slate-600">{pct}%</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function ErrorNote({ error }) {
  return error ? <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null;
}
