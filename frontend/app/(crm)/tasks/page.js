"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorNote, PageHeader } from "@/components/ui";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const load = () => api("/api/tasks").then(setTasks).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Tasks" subtitle="Manual tasks and tasks created by workflow automations" />
      <ErrorNote error={error} />
      <form className="card mb-4 flex flex-wrap gap-2 p-4" onSubmit={async (e) => { e.preventDefault(); await api("/api/tasks", { method: "POST", body: { title, due_date: due || null } }); setTitle(""); load(); }}>
        <input className="input flex-1" placeholder="New task" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input w-44" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn">Add</button>
      </form>
      <div className="card divide-y divide-slate-100">
        {tasks.map((t) => (
          <label key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <input type="checkbox" checked={t.done} onChange={async () => { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: !t.done } }); load(); }} />
            <span className={`flex-1 ${t.done ? "text-slate-400 line-through" : ""}`}>{t.title}
              {t.customer && <Link href={`/customers/${t.customer_id}`} className="ml-2 text-xs text-brand-600">{t.customer}</Link>}</span>
            {t.source !== "manual" && <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">automation</span>}
            <span className={`w-24 text-right text-xs ${!t.done && t.due_date && t.due_date < today ? "text-rose-600" : "text-slate-500"}`}>{t.due_date || "-"}</span>
            <span className="hidden w-28 text-right text-xs text-slate-500 sm:block">{t.assignee}</span>
          </label>
        ))}
      </div>
    </>
  );
}
