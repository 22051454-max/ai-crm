"use client";
import { Fragment, use, useCallback, useEffect, useState } from "react";
import { api, getUser, inr } from "@/lib/api";
import { ErrorNote, HealthBadge, PageHeader, Prob, StageBadge } from "@/components/ui";

const ICON = { call: "📞", email: "✉️", meeting: "🤝", note: "📝" };

export default function CustomerDetail({ params }) {
  const { id } = use(params);
  const [c, setC] = useState(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [draft, setDraft] = useState(null);
  const [purpose, setPurpose] = useState("renewal of the annual support contract");
  const [act, setAct] = useState({ kind: "call", subject: "", body: "" });
  const [deal, setDeal] = useState({ title: "", value: "" });
  const [openFactors, setOpenFactors] = useState(null);

  const load = useCallback(() => api(`/api/customers/${id}`).then(setC).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function addActivity(e) {
    e.preventDefault();
    await api("/api/activities", { method: "POST", body: { ...act, customer_id: Number(id) } });
    setAct({ kind: "call", subject: "", body: "" }); load();
  }
  async function addDeal(e) {
    e.preventDefault();
    await api("/api/deals", { method: "POST", body: { ...deal, customer_id: Number(id) } });
    setDeal({ title: "", value: "" }); load();
  }
  async function toggleTask(t) { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: !t.done } }); load(); }
  async function remove() {
    if (!confirm("Delete this customer and all its deals?")) return;
    try { await api(`/api/customers/${id}`, { method: "DELETE" }); window.location.href = "/customers"; } catch (e) { setError(e.message); }
  }

  if (!c) return <><ErrorNote error={error} /><p className="text-slate-500">Loading…</p></>;
  const role = getUser()?.role;
  return (
    <>
      <PageHeader title={c.company} subtitle={`${c.industry || ""} · ${c.city || ""} · owner ${c.owner}`}>
        <HealthBadge health={c.health} />
        {role !== "sales_rep" && <button className="btn-ghost text-rose-600" onClick={remove}>Delete</button>}
      </PageHeader>
      <ErrorNote error={error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">✨ AI insights</h2>
              <button className="btn-ghost" onClick={() => api(`/api/customers/${id}/insights`).then(setSummary)}>Generate summary</button></div>
            {summary && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm">{summary.summary} <span className="text-xs text-slate-400">({summary.engine})</span></p>}
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Next best actions</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">{c.next_actions.map((a) => <li key={a}>{a}</li>)}</ul>
            <h3 className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Health factors</h3>
            <p className="text-sm text-slate-600">{c.health.factors.join(" · ") || "No signals yet"}</p>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Deals</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Deal</th><th>Value</th><th>Stage</th><th>Win probability</th></tr></thead>
              <tbody>{c.deals.map((d) => (
                <Fragment key={d.id}>
                  <tr className="cursor-pointer border-t border-slate-100" onClick={() => setOpenFactors(openFactors === d.id ? null : d.id)}>
                    <td className="py-2">{d.title}</td><td>{inr(d.value)}</td><td><StageBadge stage={d.stage} /></td><td><Prob p={d.score.probability} /></td>
                  </tr>
                  {openFactors === d.id && d.score.factors.length > 0 && (
                    <tr><td colSpan={4} className="pb-3 text-xs text-slate-600">
                      {d.score.factors.map((f) => <span key={f.name} className={`mr-2 inline-block rounded px-2 py-0.5 ${f.impact >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>{f.name}: {f.detail} ({f.impact > 0 ? "+" : ""}{f.impact})</span>)}
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table>
            <form onSubmit={addDeal} className="mt-4 flex flex-wrap gap-2">
              <input className="input flex-1" placeholder="New deal title" required value={deal.title} onChange={(e) => setDeal({ ...deal, title: e.target.value })} />
              <input className="input w-36" type="number" placeholder="Value ₹" required value={deal.value} onChange={(e) => setDeal({ ...deal, value: e.target.value })} />
              <button className="btn">Add deal</button>
            </form>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Communication timeline</h2>
            <form onSubmit={addActivity} className="mb-4 flex flex-wrap gap-2">
              <select className="input w-32" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })}>
                {Object.keys(ICON).map((k) => <option key={k}>{k}</option>)}</select>
              <input className="input flex-1" placeholder="Subject" required value={act.subject} onChange={(e) => setAct({ ...act, subject: e.target.value })} />
              <button className="btn">Log</button>
            </form>
            <ol className="space-y-3">{c.activities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm"><span>{ICON[a.kind]}</span>
                <div><div className="font-medium">{a.subject} {a.automated && <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs text-slate-500">automated</span>}</div>
                  <div className="text-xs text-slate-400">{a.user} · {new Date(a.created_at).toLocaleString()}</div></div></li>
            ))}</ol>
          </div>
        </div>
        <div className="space-y-6">
          <div className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Contact</h2>
            <p>{c.contact_name}</p><p className="text-slate-500">{c.email}</p><p className="text-slate-500">{c.phone}</p>
            <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{t}</span>)}</div>
          </div>
          <div className="card p-5">
            <h2 className="mb-2 font-semibold">✨ AI email draft</h2>
            <input className="input mb-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <button className="btn-ghost" onClick={() => api(`/api/customers/${id}/email-draft`, { method: "POST", body: { purpose } }).then(setDraft)}>Draft email</button>
            {draft && <textarea className="input mt-3 h-56 font-mono text-xs" defaultValue={draft.draft} />}
          </div>
          <div className="card p-5">
            <h2 className="mb-2 font-semibold">Tasks</h2>
            <ul className="space-y-2 text-sm">{c.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2"><input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} className="mt-1" />
                <span className={t.done ? "text-slate-400 line-through" : ""}>{t.title}<span className="block text-xs text-slate-400">{t.due_date} · {t.source}</span></span></li>
            ))}{!c.tasks.length && <li className="text-slate-500">No tasks</li>}</ul>
          </div>
        </div>
      </div>
    </>
  );
}
