"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, inr, lakh } from "@/lib/api";
import { ErrorNote, HealthBadge, PageHeader, Prob, StageBadge } from "@/components/ui";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/api/dashboard").then(setD).catch((e) => setError(e.message)); }, []);
  if (!d) return <><ErrorNote error={error} /><p className="text-slate-500">Loading…</p></>;
  const k = d.kpis;
  const max = Math.max(...STAGES.map((s) => d.by_stage[s].value), 1);
  const tiles = [
    ["Open pipeline", lakh(k.open_value), `${k.open_deals} deals`],
    ["AI weighted forecast", lakh(k.weighted_forecast), "probability-weighted"],
    ["Won revenue", lakh(k.won_value), `win rate ${Math.round(k.win_rate * 100)}%`],
    ["Customers", k.customers, `${k.tasks_due} tasks due`],
  ];
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Pipeline health and AI insights for your accounts" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([t, v, s]) => (
          <div key={t} className="card p-4"><div className="text-xs uppercase text-slate-500">{t}</div>
            <div className="mt-1 text-2xl font-bold">{v}</div><div className="text-xs text-slate-500">{s}</div></div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Pipeline by stage</h2>
          <div className="space-y-3">
            {STAGES.map((s) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                <div className="w-28"><StageBadge stage={s} /></div>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div className="h-3 rounded bg-brand-500" style={{ width: (100 * d.by_stage[s].value) / max + "%" }} />
                </div>
                <div className="w-36 text-right text-slate-600">{lakh(d.by_stage[s].value)} · {d.by_stage[s].count}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Upcoming tasks</h2>
          <ul className="space-y-2 text-sm">
            {d.tasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.title}</span>
                <span className={`shrink-0 text-xs ${t.due_date && t.due_date < new Date().toISOString().slice(0, 10) ? "text-rose-600" : "text-slate-500"}`}>{t.due_date}</span></li>
            ))}
            {!d.tasks.length && <li className="text-slate-500">Nothing due 🎉</li>}
          </ul>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">⚠️ At-risk deals (AI score)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Deal</th><th>Customer</th><th>Value</th><th>Stage</th><th>Win prob.</th></tr></thead>
            <tbody>
              {d.at_risk.map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="py-2">{x.title}</td><td><Link className="text-brand-600" href={`/customers/${x.customer_id}`}>{x.customer}</Link></td>
                  <td>{inr(x.value)}</td><td><StageBadge stage={x.stage} /></td><td><Prob p={x.probability} /></td>
                </tr>
              ))}
              {!d.at_risk.length && <tr><td className="py-2 text-slate-500" colSpan={5}>No high-risk deals</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Accounts needing attention</h2>
          <ul className="space-y-2 text-sm">
            {d.unhealthy.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <Link className="truncate text-brand-600" href={`/customers/${c.id}`}>{c.company}</Link><HealthBadge health={c} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
