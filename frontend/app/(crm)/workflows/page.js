"use client";
import { useEffect, useState } from "react";
import { api, getUser } from "@/lib/api";
import { ErrorNote, PageHeader } from "@/components/ui";

const TRIGGERS = { deal_stage_changed: "Deal moves to stage", customer_created: "Customer created", deal_stale: "Deal stalled (days)" };
const ACTIONS = { create_task: "Create task for owner", log_email: "Send & log email", notify_manager: "Notify team manager" };
const EMPTY = { name: "", trigger: "deal_stage_changed", trigger_value: "proposal", action: "create_task", template: "Call {contact} at {company} about {deal}", due_in_days: 1 };

export default function Workflows() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const canEdit = ["admin", "manager"].includes(getUser()?.role);
  const load = () => api("/api/workflows").then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader title="Communication workflows" subtitle="Automations that run when CRM events happen">
        {canEdit && <button className="btn-ghost" onClick={async () => { const r = await api("/api/workflows/run-stale", { method: "POST" }); setResult(`Stale-deal check created ${r.length} task(s)`); load(); }}>Run stale-deal check</button>}
        {canEdit && <button className="btn" onClick={() => setForm(EMPTY)}>+ New workflow</button>}
      </PageHeader>
      <ErrorNote error={error} />
      {result && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{result}</p>}
      {form && (
        <form className="card mb-6 grid gap-3 p-5 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/workflows", { method: "POST", body: form }); setForm(null); load(); } catch (err) { setError(err.message); } }}>
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">When</label><select className="input" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
            {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">Trigger value (stage or days)</label><input className="input" value={form.trigger_value} onChange={(e) => setForm({ ...form, trigger_value: e.target.value })} /></div>
          <div><label className="label">Then</label><select className="input" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="label">Template · placeholders {"{company} {contact} {deal} {value} {owner} {stage}"}</label>
            <input className="input" required value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /></div>
          <div className="flex gap-2"><button className="btn">Save</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((w) => (
          <div key={w.id} className={`card p-5 ${w.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{w.name}</h3>
              {canEdit && <button className="text-xs text-brand-600" onClick={async () => { await api(`/api/workflows/${w.id}`, { method: "PATCH", body: { enabled: !w.enabled } }); load(); }}>{w.enabled ? "Disable" : "Enable"}</button>}
            </div>
            <p className="mt-1 text-sm text-slate-600"><b>When</b> {TRIGGERS[w.trigger]}{w.trigger_value ? `: ${w.trigger_value}` : ""} <b>then</b> {ACTIONS[w.action].toLowerCase()}</p>
            <p className="mt-2 rounded bg-slate-50 p-2 font-mono text-xs text-slate-600">{w.template}</p>
            <p className="mt-2 text-xs text-slate-400">Ran {w.runs} time(s)</p>
          </div>
        ))}
      </div>
    </>
  );
}
