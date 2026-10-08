"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getToken, getUser } from "@/lib/api";

const NAV = [
  ["/dashboard", "Dashboard", "📊"], ["/customers", "Customers", "🏢"], ["/pipeline", "Pipeline", "🧭"],
  ["/tasks", "Tasks", "✅"], ["/workflows", "Workflows", "⚙️"], ["/users", "Users", "👥", ["admin", "manager"]],
];

export default function Shell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
    else setUser(getUser());
  }, [router]);

  if (!user) return null;
  return (
    <div className="min-h-screen md:flex">
      <aside className={`${open ? "block" : "hidden"} md:block w-full md:w-60 shrink-0 border-r border-slate-200 bg-white`}>
        <div className="px-5 py-5 text-xl font-bold">Pulse<span className="text-brand-600">CRM</span></div>
        <nav className="space-y-1 px-3">
          {NAV.filter(([, , , roles]) => !roles || roles.includes(user.role)).map(([href, label, icon]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${path.startsWith(href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="m-3 mt-8 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-slate-500">{user.role.replace("_", " ")}{user.team ? ` · ${user.team} team` : ""}</div>
          <button className="mt-2 text-xs text-rose-600" onClick={() => { clearSession(); router.push("/login"); }}>Sign out</button>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <span className="font-bold">PulseCRM</span>
          <button className="btn-ghost" onClick={() => setOpen(!open)}>Menu</button>
        </div>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
