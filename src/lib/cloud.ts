import type { State } from "./model";
import type { Interval, PlanId } from "./plans";

/** Lo que el servidor publica en /api/config. Sin servidor (vista previa) no hay nube ni cobro. */
export interface Config {
  /** Hay base de datos: se pueden crear cuentas y guardar en la nube */
  accounts: boolean;
  billing: boolean;
  /** Beta: el cobro todavía no está activo y Pro es gratis */
  beta: boolean;
  /** Hay correo configurado: recuperar la contraseña manda un enlace */
  email: boolean;
  /** Con cobro activo: Plus y Pro se prueban gratis dando la tarjeta */
  trialNeedsCard: boolean;
  founder: boolean;
  trialDays: number;
  supportEmail: string;
  /** WhatsApp de soporte (con 52), o vacío */
  supportWhatsapp?: string;
}
export interface Entitlement {
  plan: PlanId;
  source: "free" | "trial" | "subscription" | "beta";
  trialEndsAt?: string;
  status?: string;
  interval?: string;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** Suscripción en prueba: fecha del primer cobro */
  trialEnd?: string;
  /** Puede empezar la prueba con tarjeta (una vez por cuenta) */
  trialAvailable?: boolean;
  /** Días de esa prueba: 30 si lo invitó un colega */
  trialDays?: number;
}
export interface User { id: string; email: string; monthlyEmail?: boolean }
export interface Session { user: User }
export const FREE_ENT: Entitlement = { plan: "free", source: "free" };

const TOKEN_KEY = "odontocostos.session", LAST_EMAIL = "odontocostos.last-email";
/** Usuario cuyos datos están en este dispositivo */
export const LINK_KEY = "odontocostos.linked-user";
const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sin almacenamiento */ } },
  del: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ } },
};
export const hasToken = () => !!token.get();

/** Código de invitación de un colega (?ref= en la página de venta o en la app), guardado hasta crear la cuenta. */
const REF_KEY = "odontocostos.ref";
export function captureRef(search = location.search) {
  const r = new URLSearchParams(search).get("ref");
  if (r && /^[A-Za-z0-9]{4,12}$/.test(r)) try { localStorage.setItem(REF_KEY, r.toUpperCase()); } catch { /* sin almacenamiento */ }
}
export const invitedBy = () => { try { return localStorage.getItem(REF_KEY) || ""; } catch { return ""; } };
/** Último correo que entró en este dispositivo: para proponer "Ya tengo cuenta" */
export const lastEmail = () => { try { return localStorage.getItem(LAST_EMAIL) || ""; } catch { return ""; } };

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
async function auth(path: string, body: Record<string, string>) {
  const a = await api<Auth>(path, "POST", body);
  token.set(a.token);
  try { localStorage.setItem(LAST_EMAIL, a.user.email); } catch { /* sin almacenamiento */ }
  return { session: { user: a.user }, ent: a.entitlement };
}
export async function signUp(email: string, password: string) {
  const r = await auth("/api/auth/signup", { email, password, ref: invitedBy() });
  try { localStorage.removeItem(REF_KEY); } catch { /* sin almacenamiento */ }
  return r;
}
export interface Referral { code: string; link: string; invited: number; paid: number; days: number }
export const fetchReferral = () => api<Referral>("/api/referral");
export const signIn = (email: string, password: string) => auth("/api/auth/login", { email, password });
/** Pide recuperar la contraseña. email: llega un enlace; manual: la solicitud queda en el panel del dueño. */
export const requestReset = (email: string, whatsapp = "") => api<{ via: "email" | "manual" }>("/api/auth/forgot", "POST", { email, whatsapp });
export const resetPassword = (resetToken: string, password: string) => auth("/api/auth/reset", { token: resetToken, password });
export async function signOut() {
  await api("/api/auth/logout", "POST", {}).catch(() => undefined);
  token.del();
}
export async function fetchMe() {
  const me = await api<{ user: User; entitlement: Entitlement }>("/api/me");
  return { session: { user: me.user }, ent: me.entitlement };
}
export const changePassword = (current: string, next: string) => api("/api/account/password", "POST", { current, next });
export const setPrefs = (p: { monthlyEmail: boolean }) => api("/api/account/prefs", "POST", p);
export async function deleteAccount() {
  await api("/api/account", "DELETE");
  token.del();
  try { localStorage.removeItem(LAST_EMAIL); } catch { /* sin almacenamiento */ }
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
