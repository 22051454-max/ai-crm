"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveSession } from "@/lib/api";

const DEMO = [
  ["admin@demo.com", "Admin: everything + users"],
  ["manager@demo.com", "Manager: East team"],
  ["rep@demo.com", "Sales rep: own accounts"],
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("manager@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
      saveSession(r.token, r.user);
      router.push("/dashboard");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-white p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pulse<span className="text-brand-600">CRM</span></h1>
          <p className="text-sm text-slate-500">AI-powered customer relationships</p>
        </div>
        <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn w-full justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold">Demo accounts (password demo1234)</p>
          {DEMO.map(([e, d]) => (
            <button type="button" key={e} onClick={() => setEmail(e)} className="block w-full text-left hover:text-brand-600">
              {e} <span className="text-slate-400">· {d}</span>
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}
