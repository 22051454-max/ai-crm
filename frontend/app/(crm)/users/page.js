"use client";
import { useEffect, useState } from "react";
import { api, getUser } from "@/lib/api";
import { ErrorNote, PageHeader } from "@/components/ui";

export default function Users() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales_rep", team: "East" });
  const [error, setError] = useState("");
  const isAdmin = getUser()?.role === "admin";
  const load = () => api("/api/users").then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function patch(u, body) { try { await api(`/api/users/${u.id}`, { method: "PATCH", body }); load(); } catch (e) { setError(e.message); } }

  return (
    <>
      <PageHeader title="Users & access control" subtitle="Admins manage roles; managers can view their organisation" />
      <ErrorNote error={error} />
      <div className="card mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th>Email</th><th>Team</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id} className="border-t border-slate-100">
              <td className="px-4 py-3">{u.name}</td><td>{u.email}</td><td>{u.team || "-"}</td>
              <td>{isAdmin ? <select className="rounded border border-slate-200 text-sm" value={u.role} onChange={(e) => patch(u, { role: e.target.value })}>
                {["admin", "manager", "sales_rep"].map((r) => <option key={r}>{r}</option>)}</select> : u.role}</td>
              <td>{isAdmin ? <button className={u.active ? "text-emerald-600" : "text-rose-600"} onClick={() => patch(u, { active: !u.active })}>{u.active ? "Active" : "Disabled"}</button> : (u.active ? "Active" : "Disabled")}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {isAdmin && (
        <form className="card grid gap-3 p-5 sm:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/users", { method: "POST", body: form }); load(); } catch (err) { setError(err.message); } }}>
          {["name", "email", "password"].map((f) => <div key={f}><label className="label">{f}</label><input className="input" type={f === "password" ? "password" : "text"} required value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></div>)}
          <div><label className="label">Role</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{["sales_rep", "manager", "admin"].map((r) => <option key={r}>{r}</option>)}</select></div>
          <div><label className="label">Team</label><select className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}><option>East</option><option>West</option></select></div>
          <button className="btn sm:col-span-5 sm:w-32">Add user</button>
        </form>
      )}
    </>
  );
}
