// Servidor de OdontoCostos: sirve la página de venta y la app (dist/) y la API de cobro.
// Variables de entorno: ver .env.example. Sin ellas, la app funciona sin cuentas ni cobro.
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const env = process.env;
const PORT = Number(env.PORT || 3000);
const APP_URL = (env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
const admin = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const billingReady = !!(stripe && admin && env.STRIPE_WEBHOOK_SECRET);

const LOOKUP = { plus: { month: "plus_monthly", year: "plus_yearly" }, pro: { month: "pro_monthly", year: "pro_yearly" } };
const ACTIVE = ["active", "trialing", "past_due"];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const planFromLookup = (k) => (k?.startsWith("pro_") ? "pro" : k?.startsWith("plus_") ? "plus" : null);

const priceIds = new Map();
async function priceId(plan, interval) {
  const key = LOOKUP[plan]?.[interval];
  if (!key) throw httpError(400, "Ese plan no existe.");
  if (!priceIds.has(key)) {
    const r = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (!r.data[0]) throw new Error(`Falta el precio ${key} en Stripe. Corre npm run stripe:setup.`);
    priceIds.set(key, r.data[0].id);
  }
  return priceIds.get(key);
}

// El cupón de fundador se aplica solo mientras queden lugares.
let founder = { at: 0, active: false };
async function founderActive() {
  if (!stripe || !env.STRIPE_FOUNDER_COUPON) return false;
  if (Date.now() - founder.at < 5 * 60_000) return founder.active;
  try {
    const c = await stripe.coupons.retrieve(env.STRIPE_FOUNDER_COUPON);
    founder = { at: Date.now(), active: !!c.valid && (!c.max_redemptions || c.times_redeemed < c.max_redemptions) };
  } catch {
    founder = { at: Date.now(), active: false };
  }
  return founder.active;
}

async function requireUser(req) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !admin) throw httpError(401, "Entra a tu cuenta para continuar.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError(401, "Tu sesión expiró. Entra de nuevo.");
  return data.user;
}
async function customerFor(user) {
  const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id;
  const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
  const { error } = await admin.from("profiles").upsert({ id: user.id, email: user.email, stripe_customer_id: c.id });
  if (error) throw error;
  return c.id;
}
async function userForCustomer(customerId) {
  const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id || null;
}
async function syncSubscription(sub, hintUserId) {
  const userId = sub.metadata?.user_id || hintUserId || (await userForCustomer(sub.customer));
  if (!userId) return console.warn("Suscripción sin usuario:", sub.id);
  const { data: existing } = await admin.from("subscriptions").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
  // Un aviso tardío de una suscripción vieja no debe pisar la nueva.
  if (existing && existing.stripe_subscription_id !== sub.id && !ACTIVE.includes(sub.status)) return;
  const item = sub.items?.data?.[0], price = item?.price;
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    plan: planFromLookup(price?.lookup_key) || sub.metadata?.plan || null,
    interval: price?.recurring?.interval || null,
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000",
  });
  next();
});

// Stripe necesita el cuerpo sin procesar para verificar la firma: va antes de express.json().
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!billingReady) return res.status(503).send("Cobro no configurado");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send("Firma inválida");
  }
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      if (s.mode === "subscription" && s.subscription) await syncSubscription(await stripe.subscriptions.retrieve(s.subscription), s.client_reference_id);
    } else if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(event.data.object);
    }
    res.json({ received: true });
  } catch (e) {
    console.error("Webhook", event.type, e);
    res.status(500).send("Error al procesar");
  }
});

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, billing: billingReady, accounts: !!admin }));

app.get("/api/config", async (_req, res) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return res.status(503).json({ error: "Cuentas no configuradas" });
  res.set("cache-control", "no-store").json({
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    billing: billingReady,
    founder: await founderActive(),
    google: env.GOOGLE_AUTH === "1",
    supportEmail: env.SUPPORT_EMAIL || "",
  });
});

app.post("/api/checkout", async (req, res) => {
  if (!billingReady) throw httpError(503, "El cobro todavía no está activo. Intenta más tarde.");
  const user = await requireUser(req);
  const { plan, interval } = req.body || {};
  if (!["plus", "pro"].includes(plan) || !["month", "year"].includes(interval)) throw httpError(400, "Elige un plan y un periodo válidos.");
  const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
  if (sub && ACTIVE.includes(sub.status)) throw httpError(409, "Ya tienes una suscripción. Cámbiala desde Administrar suscripción.");
  const params = {
    mode: "subscription",
    customer: await customerFor(user),
    client_reference_id: user.id,
    line_items: [{ price: await priceId(plan, interval), quantity: 1 }],
    success_url: `${APP_URL}/app/?pago=ok`,
    cancel_url: `${APP_URL}/app/planes`,
    locale: "es-419",
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
    custom_text: { submit: { message: "Precio en pesos mexicanos con IVA incluido. Cancela cuando quieras desde tu cuenta." } },
  };
  let session = null;
  if (await founderActive()) {
    try { session = await stripe.checkout.sessions.create({ ...params, discounts: [{ coupon: env.STRIPE_FOUNDER_COUPON }] }); }
    catch { founder.at = 0; } // el cupón se acabó justo ahora: se cobra el precio normal
  }
  if (!session) session = await stripe.checkout.sessions.create({ ...params, allow_promotion_codes: true });
  res.json({ url: session.url });
});

app.post("/api/portal", async (req, res) => {
  if (!billingReady) throw httpError(503, "El cobro todavía no está activo.");
  const user = await requireUser(req);
  const s = await stripe.billingPortal.sessions.create({
    customer: await customerFor(user),
    return_url: `${APP_URL}/app/cuenta`,
    ...(env.STRIPE_PORTAL_CONFIG ? { configuration: env.STRIPE_PORTAL_CONFIG } : {}),
  });
  res.json({ url: s.url });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "No existe" }));

// Archivos: los de /assets llevan huella en el nombre y se guardan un año.
app.use("/assets", express.static(join(DIST, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
app.use(express.static(DIST, { maxAge: "10m" }));
app.get(/^\/app(\/.*)?$/, (_req, res) => res.sendFile(join(DIST, "app", "index.html")));
app.use((_req, res) => res.status(404).sendFile(join(DIST, "404.html")));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Algo falló de nuestro lado. Intenta de nuevo en un momento." : err.message });
});

app.listen(PORT, () => console.log(`OdontoCostos en ${APP_URL} (cuentas: ${admin ? "sí" : "no"}, cobro: ${billingReady ? "sí" : "no"})`));
