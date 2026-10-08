"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, lakh } from "@/lib/api";
import { ErrorNote, HealthBadge, PageHeader } from "@/components/ui";

const EMPTY = { company: "", contact_name: "", email: "", phone: "", industry: "", city: "" };

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => api("/api/customers" + (q ? `?q=${encodeURIComponent(q)}` : "")).then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault();
    try {
      const c = await api("/api/customers", { method: "POST", body: form });
      setForm(null);
      setNotice(c.automations?.length ? `Created ${c.company}. Automation ran: ${c.automations.map((a) => a.workflow).join(", ")}` : `Created ${c.company}`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <PageHeader title="Customers" subtitle={`${rows.length} accounts you can access`}>
        <input className="input w-56" placeholder="Search company, contact, industry" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setForm(EMPTY)}>+ New customer</button>
      </PageHeader>
      <ErrorNote error={error} />
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {form && (
        <form onSubmit={save} className="card mb-6 grid gap-3 p-5 sm:grid-cols-3">
          {Object.keys(EMPTY).map((f) => (
            <div key={f}><label className="label">{f.replace("_", " ")}</label>
              <input className="input" required={f === "company"} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></div>
          ))}
          <div className="flex gap-2 sm:col-span-3"><button className="btn">Save</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Company</th><th>Contact</th><th>Industry</th><th>Owner</th><th>Open pipeline</th><th>Health</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3"><Link href={`/customers/${c.id}`} className="font-medium text-brand-600">{c.company}</Link>
                  <div className="text-xs text-slate-400">{c.city} · {c.status}</div></td>
                <td>{c.contact_name}<div className="text-xs text-slate-400">{c.email}</div></td>
                <td>{c.industry}</td><td>{c.owner}</td><td>{lakh(c.open_pipeline)}</td><td><HealthBadge health={c.health} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
