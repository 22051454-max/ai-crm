"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, lakh } from "@/lib/api";
import { ErrorNote, PageHeader, Prob } from "@/components/ui";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [drag, setDrag] = useState(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const load = () => api("/api/deals").then(setDeals).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function move(deal, stage) {
    if (!deal || deal.stage === stage) return;
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    try {
      const r = await api(`/api/deals/${deal.id}`, { method: "PATCH", body: { stage } });
      if (r.automations?.length) {
        setToast(`⚙️ ${r.automations.map((a) => `${a.workflow}: ${a.result}`).join(" | ")}`);
        setTimeout(() => setToast(""), 6000);
      }
      load();
    } catch (e) { setError(e.message); load(); }
  }

  return (
    <>
      <PageHeader title="Sales pipeline" subtitle="Drag deals between stages. Stage changes trigger workflows." />
      <ErrorNote error={error} />
      {toast && <div className="fixed bottom-4 right-4 z-10 max-w-md rounded-lg bg-slate-900 p-3 text-sm text-white shadow-lg">{toast}</div>}
      <div className="grid gap-3 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))` }}>
        {STAGES.map((s) => {
          const col = deals.filter((d) => d.stage === s);
          return (
            <div key={s} onDragOver={(e) => e.preventDefault()} onDrop={() => move(drag, s)}
              className="min-h-[60vh] rounded-xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold capitalize">
                <span>{s}</span><span className="text-xs font-normal text-slate-500">{col.length} · {lakh(col.reduce((a, d) => a + d.value, 0))}</span>
              </div>
              <div className="space-y-2">
                {col.map((d) => (
                  <div key={d.id} draggable onDragStart={() => setDrag(d)} className="card cursor-grab p-3 active:cursor-grabbing">
                    <div className="text-sm font-medium">{d.title}</div>
                    <Link href={`/customers/${d.customer_id}`} className="text-xs text-brand-600">{d.customer}</Link>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{lakh(d.value)}</span>{!["won", "lost"].includes(d.stage) && <Prob p={d.score.probability} />}
                    </div>
                    <select aria-label="Move to stage" className="mt-2 w-full rounded border border-slate-200 bg-white text-xs md:hidden" value={d.stage} onChange={(e) => move(d, e.target.value)}>
                      {STAGES.map((x) => <option key={x}>{x}</option>)}</select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
