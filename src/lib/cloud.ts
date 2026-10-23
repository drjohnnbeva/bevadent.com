import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { State } from "./model";
import type { Interval, PlanId } from "./plans";

/** Lo que el servidor publica en /api/config. Sin servidor (vista previa) no hay nube ni cobro. */
export interface Config {
  supabaseUrl: string;
  supabaseAnonKey: string;
  billing: boolean;
  founder: boolean;
  google: boolean;
  supportEmail: string;
}
export interface Entitlement {
  plan: PlanId;
  source: "free" | "trial" | "subscription";
  trialEndsAt?: string;
  status?: string;
  interval?: string;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}
export const FREE_ENT: Entitlement = { plan: "free", source: "free" };

let sb: SupabaseClient | null = null;
export const supabase = () => sb;

export async function loadConfig(): Promise<Config | null> {
  if (__PREVIEW__) return null;
  try {
    const r = await fetch("/api/config", { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const c = (await r.json()) as Config;
    return c.supabaseUrl && c.supabaseAnonKey ? c : null;
  } catch {
    return null;
  }
}
export async function initSupabase(cfg: Config) {
  const { createClient } = await import("@supabase/supabase-js");
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return sb;
}

const appUrl = () => location.origin + "/app/";
export async function signInWithEmail(email: string) {
  const { error } = await sb!.auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl(), shouldCreateUser: true } });
  if (error) throw error;
}
export async function signInWithGoogle() {
  const { error } = await sb!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl() } });
  if (error) throw error;
}
export const signOut = () => sb!.auth.signOut();

const ACTIVE = ["active", "trialing", "past_due"];
export async function fetchEntitlement(userId: string): Promise<Entitlement> {
  const [p, s] = await Promise.all([
    sb!.from("profiles").select("trial_ends_at").eq("id", userId).maybeSingle(),
    sb!.from("subscriptions").select("plan,status,interval,current_period_end,cancel_at_period_end").eq("user_id", userId).maybeSingle(),
  ]);
  const sub = s.data as any, prof = p.data as any;
  if (sub && ACTIVE.includes(sub.status) && (sub.plan === "plus" || sub.plan === "pro"))
    return { plan: sub.plan, source: "subscription", status: sub.status, interval: sub.interval, periodEnd: sub.current_period_end, cancelAtPeriodEnd: !!sub.cancel_at_period_end };
  if (prof && prof.trial_ends_at && new Date(prof.trial_ends_at).getTime() > Date.now())
    return { plan: "pro", source: "trial", trialEndsAt: prof.trial_ends_at, status: sub?.status };
  return { ...FREE_ENT, trialEndsAt: prof?.trial_ends_at, status: sub?.status };
}

export async function fetchCloudState(userId: string): Promise<{ data: State; updatedAt: number } | null> {
  const { data, error } = await sb!.from("clinic_states").select("data,updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { data: (data as any).data, updatedAt: new Date((data as any).updated_at).getTime() } : null;
}
export async function saveCloudState(userId: string, state: State) {
  const { error } = await sb!.from("clinic_states").upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}
export async function sendFeedback(answer: string, comment: string, plan: PlanId, userId?: string) {
  if (!sb) return;
  await sb.from("feedback").insert({ user_id: userId || null, would_pay: answer, comment: comment || null, plan });
}

async function post(path: string, session: Session, body?: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + session.access_token },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || "No se pudo abrir el pago. Intenta de nuevo.");
  return j.url as string;
}
export async function startCheckout(session: Session, plan: "plus" | "pro", interval: Interval) {
  location.href = await post("/api/checkout", session, { plan, interval });
}
export async function openPortal(session: Session) {
  location.href = await post("/api/portal", session);
}
