import type { State } from "./model";
import type { Interval, PlanId } from "./plans";

/** Lo que el servidor publica en /api/config. Sin servidor (vista previa) no hay nube ni cobro. */
export interface Config {
  /** Hay base de datos: se pueden crear cuentas y guardar en la nube */
  accounts: boolean;
  billing: boolean;
  /** Beta: el cobro todavía no está activo y Pro es gratis */
  beta: boolean;
  founder: boolean;
  trialDays: number;
  supportEmail: string;
}
export interface Entitlement {
  plan: PlanId;
  source: "free" | "trial" | "subscription" | "beta";
  trialEndsAt?: string;
  status?: string;
  interval?: string;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}
export interface User { id: string; email: string }
export interface Session { user: User }
export const FREE_ENT: Entitlement = { plan: "free", source: "free" };

const TOKEN_KEY = "odontocostos.session";
const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sin almacenamiento */ } },
  del: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ } },
};
export const hasToken = () => !!token.get();

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const t = token.get();
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers: { accept: "application/json", ...(body !== undefined && { "content-type": "application/json" }), ...(t && { authorization: "Bearer " + t }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Sin conexión. Revisa tu internet e intenta de nuevo.", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && t) token.del();
  if (!r.ok) throw new ApiError(j.error || "Algo falló. Intenta de nuevo en un momento.", r.status);
  return j as T;
}

export async function loadConfig(): Promise<Config | null> {
  if (__PREVIEW__) return null;
  try {
    const r = await fetch("/api/config", { headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as Config) : null;
  } catch {
    return null;
  }
}

interface Auth { token: string; user: User; entitlement: Entitlement }
async function auth(path: string, email: string, password: string) {
  const a = await api<Auth>(path, "POST", { email, password });
  token.set(a.token);
  return { session: { user: a.user }, ent: a.entitlement };
}
export const signUp = (email: string, password: string) => auth("/api/auth/signup", email, password);
export const signIn = (email: string, password: string) => auth("/api/auth/login", email, password);
export async function signOut() {
  await api("/api/auth/logout", "POST", {}).catch(() => undefined);
  token.del();
}
export async function fetchMe() {
  const me = await api<{ user: User; entitlement: Entitlement }>("/api/me");
  return { session: { user: me.user }, ent: me.entitlement };
}
export const changePassword = (current: string, next: string) => api("/api/account/password", "POST", { current, next });
export async function deleteAccount() {
  await api("/api/account", "DELETE");
  token.del();
}

export async function fetchCloudState(): Promise<{ data: State; updatedAt: number } | null> {
  const r = await api<{ data: State | null; updatedAt?: number }>("/api/state");
  return r.data ? { data: r.data, updatedAt: r.updatedAt || 0 } : null;
}
export const saveCloudState = (state: State) => api<{ updatedAt: number }>("/api/state", "PUT", { data: state });
export const sendFeedback = (answer: string, comment: string, plan: PlanId) => api("/api/feedback", "POST", { answer, comment, plan });
export const sendSupport = (email: string, message: string) => api("/api/support", "POST", { email, message });

export async function startCheckout(plan: "plus" | "pro", interval: Interval) {
  location.href = (await api<{ url: string }>("/api/checkout", "POST", { plan, interval })).url;
}
export async function openPortal() {
  location.href = (await api<{ url: string }>("/api/portal", "POST", {})).url;
}
