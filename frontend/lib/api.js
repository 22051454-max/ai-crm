"use client";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

export function getToken() {
  try { return localStorage.getItem("crm_token"); } catch { return null; }
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem("crm_user") || "null"); } catch { return null; }
}
export function saveSession(token, user) {
  localStorage.setItem("crm_token", token);
  localStorage.setItem("crm_user", JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem("crm_token");
  localStorage.removeItem("crm_user");
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/login")) {
    clearSession();
    window.location.href = "/login";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const lakh = (v) => "₹" + (Number(v || 0) / 100000).toFixed(1) + "L";
export const STAGE_COLORS = {
  lead: "bg-slate-100 text-slate-700", qualified: "bg-sky-100 text-sky-700", proposal: "bg-violet-100 text-violet-700",
  negotiation: "bg-amber-100 text-amber-800", won: "bg-emerald-100 text-emerald-700", lost: "bg-rose-100 text-rose-700",
};
