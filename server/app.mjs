// OdontoCostos: la API y los archivos del sitio. `createApp` recibe la base de datos para poder probarla.
// db: { query(text, params) → { rows }, exec(sql) }
import express from "express";
import Stripe from "stripe";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const HERE = dirname(fileURLToPath(import.meta.url));
export const SCHEMA = readFileSync(join(HERE, "schema.sql"), "utf8");

const LOOKUP = { plus: { month: "plus_monthly", year: "plus_yearly" }, pro: { month: "pro_monthly", year: "pro_yearly" } };
const PRICE = { plus: { month: 99, year: 990 }, pro: { month: 199, year: 1990 } };
const ACTIVE = ["active", "trialing", "past_due"];
const SESSION_DAYS = 90;
const httpError = (status, message) => Object.assign(new Error(message), { status, public: true });
const planFromLookup = (k) => (k?.startsWith("pro_") ? "pro" : k?.startsWith("plus_") ? "plus" : null);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${Buffer.from(key).toString("base64")}`;
}
export async function checkPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64");
  const got = Buffer.from(await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: +N, r: +r, p: +p }));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Límite de intentos en memoria: suficiente para un solo servidor. */
function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(), h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n++;
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return h.n <= max;
  };
}

export function createApp({ db, env = process.env, dist = join(HERE, "..", "dist"), stripeClient } = {}) {
  const APP_URL = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const stripe = stripeClient || (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null);
  const accounts = !!db;
  const billing = accounts && !!(stripe && env.STRIPE_WEBHOOK_SECRET);
  const beta = !billing;
  const trialDays = Number(beta ? env.BETA_TRIAL_DAYS || 60 : env.TRIAL_DAYS || 14);
  const limitSignup = limiter(10, 60 * 60_000), limitLoginIp = limiter(30, 15 * 60_000), limitLoginEmail = limiter(8, 15 * 60_000), limitSupport = limiter(6, 60 * 60_000);
  const q = async (text, params) => (await db.query(text, params)).rows;
  const one = async (text, params) => (await q(text, params))[0] || null;

  async function newSession(userId) {
    const token = randomBytes(32).toString("base64url");
    await q("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)", [sha256(token), userId, String(SESSION_DAYS)]);
    return token;
  }
  async function currentUser(req, required = true) {
    const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = token ? await one("select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()", [sha256(token)]) : null;
    if (!u && required) throw httpError(401, "Tu sesión terminó. Entra de nuevo.");
    return u;
  }
  async function entitlement(u) {
    const sub = await one("select * from subscriptions where user_id = $1", [u.id]);
    if (sub && ACTIVE.includes(sub.status) && (sub.plan === "plus" || sub.plan === "pro"))
      return { plan: sub.plan, source: "subscription", status: sub.status, interval: sub.interval, periodEnd: sub.current_period_end, cancelAtPeriodEnd: sub.cancel_at_period_end };
    if (beta) return { plan: "pro", source: "beta" };
    if (new Date(u.trial_ends_at).getTime() > Date.now()) return { plan: "pro", source: "trial", trialEndsAt: u.trial_ends_at, status: sub?.status };
    return { plan: "free", source: "free", trialEndsAt: u.trial_ends_at, status: sub?.status };
  }
  const publicUser = (u) => ({ id: u.id, email: u.email });

  // ---------- Stripe ----------
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
  let founder = { at: 0, active: false };
  async function founderActive() {
    if (!stripe || !env.STRIPE_FOUNDER_COUPON) return !billing; // en la beta se anuncia el precio de fundador
    if (Date.now() - founder.at < 5 * 60_000) return founder.active;
    try {
      const c = await stripe.coupons.retrieve(env.STRIPE_FOUNDER_COUPON);
      founder = { at: Date.now(), active: !!c.valid && (!c.max_redemptions || c.times_redeemed < c.max_redemptions) };
    } catch { founder = { at: Date.now(), active: false }; }
    return founder.active;
  }
  async function customerFor(u) {
    if (u.stripe_customer_id) return u.stripe_customer_id;
    const c = await stripe.customers.create({ email: u.email, metadata: { user_id: u.id } });
    await q("update users set stripe_customer_id = $1 where id = $2", [c.id, u.id]);
    return c.id;
  }
  async function syncSubscription(sub, hintUserId) {
    const userId = sub.metadata?.user_id || hintUserId || (await one("select id from users where stripe_customer_id = $1", [sub.customer]))?.id;
    if (!userId || !(await one("select id from users where id = $1", [userId]))) return console.warn("Suscripción sin usuario:", sub.id);
    const existing = await one("select stripe_subscription_id from subscriptions where user_id = $1", [userId]);
    // Un aviso tardío de una suscripción vieja no debe pisar la nueva.
    if (existing && existing.stripe_subscription_id !== sub.id && !ACTIVE.includes(sub.status)) return;
    const item = sub.items?.data?.[0], price = item?.price, end = sub.current_period_end ?? item?.current_period_end;
    await q(
      `insert into subscriptions (user_id, stripe_subscription_id, plan, interval, status, current_period_end, cancel_at_period_end, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (user_id) do update set stripe_subscription_id = excluded.stripe_subscription_id, plan = excluded.plan, interval = excluded.interval,
         status = excluded.status, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()`,
      [userId, sub.id, planFromLookup(price?.lookup_key) || sub.metadata?.plan || null, price?.recurring?.interval || null, sub.status, end ? new Date(end * 1000).toISOString() : null, !!sub.cancel_at_period_end],
    );
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Strict-Transport-Security": "max-age=31536000" });
    next();
  });

  // Stripe necesita el cuerpo sin procesar para verificar la firma: va antes de express.json().
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!billing) return res.status(503).send("Cobro no configurado");
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET); }
    catch { return res.status(400).send("Firma inválida"); }
    try {
      if (event.type === "checkout.session.completed") {
        const s = event.data.object;
        if (s.mode === "subscription" && s.subscription) await syncSubscription(await stripe.subscriptions.retrieve(s.subscription), s.client_reference_id);
      } else if (event.type.startsWith("customer.subscription.")) await syncSubscription(event.data.object);
      res.json({ received: true });
    } catch (e) { console.error("Webhook", event.type, e); res.status(500).send("Error al procesar"); }
  });

  app.put("/api/state", express.json({ limit: "2mb" }));
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", async (_req, res) => {
    if (db) await q("select 1");
    res.json({ ok: true, billing, beta, accounts });
  });
  app.get("/api/config", async (_req, res) => {
    res.set("cache-control", "no-store").json({ accounts, billing, beta, founder: await founderActive(), trialDays, supportEmail: env.SUPPORT_EMAIL || "" });
  });
  // Sin base de datos el sitio funciona igual, con los datos en el dispositivo.
  app.use(["/api", "/admin"], (_req, _res, next) => next(db ? undefined : httpError(503, "Las cuentas se activan muy pronto. Mientras, tus datos se guardan en este dispositivo.")));

  // ---------- Cuentas ----------
  const readCreds = (body) => {
    const email = String(body?.email || "").trim().toLowerCase(), password = String(body?.password || "");
    if (!EMAIL_RE.test(email)) throw httpError(400, "Escribe un correo válido, por ejemplo ana@consultorio.mx.");
    return { email, password };
  };
  app.post("/api/auth/signup", async (req, res) => {
    if (!limitSignup(req.ip)) throw httpError(429, "Demasiados registros desde esta conexión. Intenta en una hora.");
    const { email, password } = readCreds(req.body);
    if (password.length < 8) throw httpError(400, "La contraseña necesita al menos 8 caracteres.");
    if (password.length > 200) throw httpError(400, "La contraseña es demasiado larga.");
    if (await one("select id from users where email = $1", [email])) throw httpError(409, "Ya hay una cuenta con ese correo. Entra con tu contraseña.");
    const u = await one("insert into users (email, password_hash, trial_ends_at) values ($1, $2, now() + ($3 || ' days')::interval) returning *", [email, await hashPassword(password), String(trialDays)]);
    res.status(201).json({ token: await newSession(u.id), user: publicUser(u), entitlement: await entitlement(u) });
  });
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = readCreds(req.body);
    if (!limitLoginIp(req.ip) || !limitLoginEmail(email)) throw httpError(429, "Demasiados intentos. Espera 15 minutos e intenta de nuevo.");
    const u = await one("select * from users where email = $1", [email]);
    if (!u || !(await checkPassword(password, u.password_hash))) throw httpError(401, "El correo o la contraseña no coinciden.");
    res.json({ token: await newSession(u.id), user: publicUser(u), entitlement: await entitlement(u) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) await q("delete from sessions where token_hash = $1", [sha256(token)]);
    res.json({ ok: true });
  });
  app.get("/api/me", async (req, res) => {
    const u = await currentUser(req);
    res.set("cache-control", "no-store").json({ user: publicUser(u), entitlement: await entitlement(u) });
  });
  app.post("/api/account/password", async (req, res) => {
    const u = await currentUser(req);
    const { current, next } = req.body || {};
    if (!(await checkPassword(String(current || ""), u.password_hash))) throw httpError(400, "Tu contraseña actual no coincide.");
    if (String(next || "").length < 8) throw httpError(400, "La contraseña nueva necesita al menos 8 caracteres.");
    await q("update users set password_hash = $1 where id = $2", [await hashPassword(String(next)), u.id]);
    await q("delete from sessions where user_id = $1 and token_hash <> $2", [u.id, sha256((req.get("authorization") || "").replace(/^Bearer\s+/i, ""))]);
    res.json({ ok: true });
  });
  app.delete("/api/account", async (req, res) => {
    const u = await currentUser(req);
    const sub = await one("select * from subscriptions where user_id = $1", [u.id]);
    if (billing && sub && ACTIVE.includes(sub.status)) await stripe.subscriptions.cancel(sub.stripe_subscription_id).catch((e) => console.error("Cancelar al borrar cuenta", e));
    await q("delete from users where id = $1", [u.id]);
    res.json({ ok: true });
  });

  // ---------- Datos del consultorio ----------
  app.get("/api/state", async (req, res) => {
    const u = await currentUser(req);
    const row = await one("select data, updated_at from clinic_states where user_id = $1", [u.id]);
    res.set("cache-control", "no-store").json(row ? { data: row.data, updatedAt: new Date(row.updated_at).getTime() } : { data: null });
  });
  app.put("/api/state", async (req, res) => {
    const u = await currentUser(req);
    const data = req.body?.data;
    if (!data || typeof data !== "object" || !data.clinic || !data.treatments) throw httpError(400, "Esos datos no tienen el formato de OdontoCostos.");
    const row = await one(
      `insert into clinic_states (user_id, data, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set data = excluded.data, updated_at = now() returning updated_at`,
      [u.id, JSON.stringify(data)],
    );
    res.json({ updatedAt: new Date(row.updated_at).getTime() });
  });

  // ---------- Opiniones y soporte ----------
  app.post("/api/feedback", async (req, res) => {
    const u = await currentUser(req, false);
    const { answer, comment, plan } = req.body || {};
    await q("insert into feedback (user_id, would_pay, comment, plan) values ($1, $2, $3, $4)", [u?.id || null, String(answer || "").slice(0, 40), comment ? String(comment).slice(0, 2000) : null, String(plan || "").slice(0, 10)]);
    res.status(201).json({ ok: true });
  });
  app.post("/api/support", async (req, res) => {
    if (!limitSupport(req.ip)) throw httpError(429, "Ya recibimos varios mensajes desde aquí. Intenta más tarde.");
    const u = await currentUser(req, false);
    const email = String(req.body?.email || u?.email || "").trim().toLowerCase(), message = String(req.body?.message || "").trim();
    if (!EMAIL_RE.test(email)) throw httpError(400, "Escribe el correo donde quieres que te respondamos.");
    if (message.length < 3) throw httpError(400, "Escribe tu mensaje.");
    await q("insert into support_messages (user_id, email, message) values ($1, $2, $3)", [u?.id || null, email, message.slice(0, 4000)]);
    res.status(201).json({ ok: true });
  });

  // ---------- Cobro ----------
  app.post("/api/checkout", async (req, res) => {
    const u = await currentUser(req);
    if (!billing) throw httpError(503, "El cobro todavía no está activo. Durante la beta usas Pro sin costo.");
    const { plan, interval } = req.body || {};
    if (!["plus", "pro"].includes(plan) || !["month", "year"].includes(interval)) throw httpError(400, "Elige un plan y un periodo válidos.");
    const sub = await one("select status from subscriptions where user_id = $1", [u.id]);
    if (sub && ACTIVE.includes(sub.status)) throw httpError(409, "Ya tienes una suscripción. Cámbiala desde Administrar suscripción.");
    const params = {
      mode: "subscription", customer: await customerFor(u), client_reference_id: u.id,
      line_items: [{ price: await priceId(plan, interval), quantity: 1 }],
      success_url: `${APP_URL}/app/?pago=ok`, cancel_url: `${APP_URL}/app/planes`, locale: "es-419",
      metadata: { user_id: u.id, plan }, subscription_data: { metadata: { user_id: u.id, plan } },
      custom_text: { submit: { message: "Precio en pesos mexicanos con IVA incluido. Cancela cuando quieras desde tu cuenta." } },
    };
    let session = null;
    if (await founderActive()) {
      try { session = await stripe.checkout.sessions.create({ ...params, discounts: [{ coupon: env.STRIPE_FOUNDER_COUPON }] }); }
      catch { founder.at = 0; }
    }
    if (!session) session = await stripe.checkout.sessions.create({ ...params, allow_promotion_codes: true });
    res.json({ url: session.url });
  });
  app.post("/api/portal", async (req, res) => {
    const u = await currentUser(req);
    if (!billing) throw httpError(503, "El cobro todavía no está activo.");
    const s = await stripe.billingPortal.sessions.create({ customer: await customerFor(u), return_url: `${APP_URL}/app/cuenta`, ...(env.STRIPE_PORTAL_CONFIG ? { configuration: env.STRIPE_PORTAL_CONFIG } : {}) });
    res.json({ url: s.url });
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "No existe" }));

  // ---------- Panel del dueño ----------
  function adminOnly(req) {
    const pass = env.ADMIN_PASSWORD;
    const [, b64] = (req.get("authorization") || "").split(" ");
    const [user, pw] = Buffer.from(b64 || "", "base64").toString().split(":");
    const ok = !!pass && user === "admin" && pw && pw.length === pass.length && timingSafeEqual(Buffer.from(pw), Buffer.from(pass));
    if (!ok) throw Object.assign(new Error("Acceso restringido"), { status: 401, basic: true });
  }
  app.get("/admin", async (req, res) => {
    adminOnly(req);
    const [stats] = await q(`select (select count(*) from users)::int as users, (select count(*) from users where created_at > now() - interval '7 days')::int as week,
      (select count(*) from clinic_states)::int as with_data, (select count(*) from feedback)::int as feedback`);
    const subs = await q("select plan, interval, count(*)::int as n from subscriptions where status in ('active','trialing','past_due') group by plan, interval");
    const mrr = subs.reduce((s, x) => s + x.n * (x.interval === "year" ? PRICE[x.plan].year / 12 : PRICE[x.plan].month), 0);
    const votes = await q("select would_pay, count(*)::int as n from feedback group by would_pay order by n desc");
    const fb = await q("select f.created_at, f.would_pay, f.comment, f.plan, u.email from feedback f left join users u on u.id = f.user_id order by f.created_at desc limit 100");
    const msgs = await q("select created_at, email, message from support_messages order by created_at desc limit 100");
    const users = await q("select u.email, u.created_at, u.trial_ends_at, s.plan, s.status from users u left join subscriptions s on s.user_id = u.id order by u.created_at desc limit 200");
    const d = (x) => esc(new Date(x).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }));
    const VOTE = { si: "Sí pagaría Pro", talvez: "Tal vez, a otro precio", no: "No" };
    res.set("cache-control", "no-store").type("html").send(`<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Panel · OdontoCostos</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f3f6f3;color:#10201b}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 10px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.k div{background:#fff;border:1px solid #d9e2dd;border-radius:14px;padding:14px}.k b{display:block;font-size:28px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9e2dd;border-radius:12px;overflow:hidden}td,th{text-align:left;padding:8px 10px;border-bottom:1px solid #e9efeb;vertical-align:top}th{font-size:13px;color:#4a5b55}.w{overflow-x:auto}
form{display:flex;gap:8px;flex-wrap:wrap}input{font:inherit;padding:8px 10px;border:1px solid #d9e2dd;border-radius:10px;min-width:260px}button{font:inherit;font-weight:700;padding:8px 14px;border:0;border-radius:10px;background:#0b7a61;color:#fff;cursor:pointer}.m{color:#4a5b55}</style></head><body><main>
<h1>Panel de OdontoCostos</h1><p class="m">${beta ? "Beta gratis: el cobro con Stripe todavía no está activo." : "Cobro activo."}</p>
<div class="k"><div>Cuentas<b>${stats.users}</b></div><div>Nuevas en 7 días<b>${stats.week}</b></div><div>Con datos guardados<b>${stats.with_data}</b></div><div>Suscripciones activas<b>${subs.reduce((s, x) => s + x.n, 0)}</b></div><div>Ingreso mensual<b>$${Math.round(mrr).toLocaleString("es-MX")}</b></div><div>Respuestas a la encuesta<b>${stats.feedback}</b></div></div>
<h2>¿Pagarían?</h2><div class="w"><table><tr><th>Respuesta</th><th>Votos</th></tr>${votes.map((v) => `<tr><td>${esc(VOTE[v.would_pay] || v.would_pay)}</td><td>${v.n}</td></tr>`).join("") || '<tr><td colspan="2" class="m">Sin respuestas todavía</td></tr>'}</table></div>
<h2>Comentarios</h2><div class="w"><table><tr><th>Fecha</th><th>Correo</th><th>Respuesta</th><th>Comentario</th></tr>${fb.map((f) => `<tr><td>${d(f.created_at)}</td><td>${esc(f.email || "sin cuenta")}</td><td>${esc(VOTE[f.would_pay] || f.would_pay)}</td><td>${esc(f.comment || "")}</td></tr>`).join("") || '<tr><td colspan="4" class="m">Sin comentarios</td></tr>'}</table></div>
<h2>Mensajes de soporte</h2><div class="w"><table><tr><th>Fecha</th><th>Correo</th><th>Mensaje</th></tr>${msgs.map((m) => `<tr><td>${d(m.created_at)}</td><td>${esc(m.email)}</td><td>${esc(m.message)}</td></tr>`).join("") || '<tr><td colspan="3" class="m">Sin mensajes</td></tr>'}</table></div>
<h2>Restablecer la contraseña de un dentista</h2><p class="m">Genera una contraseña temporal para mandársela por WhatsApp. Su sesión se cierra en todos sus dispositivos.</p>
<form method="post" action="/admin/reset"><input name="email" type="email" required placeholder="correo@consultorio.mx"><button>Generar contraseña temporal</button></form>
<h2>Cuentas</h2><div class="w"><table><tr><th>Correo</th><th>Alta</th><th>Prueba hasta</th><th>Suscripción</th></tr>${users.map((u) => `<tr><td>${esc(u.email)}</td><td>${d(u.created_at)}</td><td>${d(u.trial_ends_at)}</td><td>${u.plan ? esc(u.plan + ", " + u.status) : '<span class="m">ninguna</span>'}</td></tr>`).join("")}</table></div>
</main></body></html>`);
  });
  app.post("/admin/reset", express.urlencoded({ extended: false }), async (req, res) => {
    adminOnly(req);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const u = await one("select id from users where email = $1", [email]);
    if (!u) throw httpError(404, "No hay una cuenta con ese correo.");
    const temp = randomBytes(6).toString("base64url");
    await q("update users set password_hash = $1 where id = $2", [await hashPassword(temp), u.id]);
    await q("delete from sessions where user_id = $1", [u.id]);
    res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px"><p>Contraseña temporal para <b>${esc(email)}</b>:</p><p style="font:700 24px ui-monospace,monospace">${esc(temp)}</p><p>Pídele que la cambie en Cuenta. <a href="/admin">Volver al panel</a></p></body>`);
  });

  // ---------- Archivos ----------
  app.use("/assets", express.static(join(dist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
  app.use(express.static(dist, { maxAge: "10m" }));
  app.get(/^\/app(\/.*)?$/, (_req, res) => res.sendFile(join(dist, "app", "index.html")));
  app.use((_req, res) => res.status(404).sendFile(join(dist, "404.html")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
    if (err.basic) return res.status(401).set("WWW-Authenticate", 'Basic realm="OdontoCostos", charset="UTF-8"').send("Acceso restringido");
    if (status >= 500 && !err.public) console.error(err);
    const msg = err.public ? err.message
      : status === 413 ? "Tus datos pesan demasiado. Prueba con un logo más ligero."
      : status >= 500 ? "Algo falló de nuestro lado. Intenta de nuevo en un momento." : "No entendimos la solicitud. Intenta de nuevo.";
    if (req.path.startsWith("/api")) res.status(status).json({ error: msg }); else res.status(status).type("text").send(msg);
  });
  return app;
}
