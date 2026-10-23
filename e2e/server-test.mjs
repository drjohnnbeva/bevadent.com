// Prueba del servidor con Postgres en memoria: cuentas, datos, soporte, panel, cobro y webhooks firmados.
// Uso: npm run build && node e2e/server-test.mjs
import assert from "node:assert/strict";
import { fakeStripe, serve, testDb } from "./testdb.mjs";

const SECRET = "whsec_test_odontocostos", ADMIN = "clave-del-panel-123";
const results = [];
const t = async (name, fn) => { try { await fn(); results.push("✓ " + name); } catch (e) { results.push("✗ " + name + ": " + e.message); } };
const client = (base) => {
  const call = async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body !== undefined && { "content-type": "application/json" }), ...(token && { authorization: "Bearer " + token }), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, json, text };
  };
  return call;
};
const basic = (pw) => ({ authorization: "Basic " + Buffer.from("admin:" + pw).toString("base64") });
const demo = { clinic: { rent: 12000 }, treatments: {}, order: [], months: {} };

// ---------- Sin base de datos ----------
{
  const s = await serve({ db: null, env: { SUPPORT_EMAIL: "hola@odontocostos.com" } }), api = client(s.base);
  await t("sin base: el sitio y la app cargan", async () => {
    assert.equal((await api("/")).status, 200);
    const r = await api("/app/cuenta"); assert.equal(r.status, 200); assert.match(r.text, /id="root"/);
  });
  await t("sin base: salud y configuración dicen que no hay cuentas", async () => {
    const h = await api("/api/health"); assert.equal(h.json.ok, true); assert.equal(h.json.accounts, false);
    const c = await api("/api/config"); assert.equal(c.json.accounts, false); assert.equal(c.json.beta, true); assert.equal(c.json.billing, false);
  });
  await t("sin base: crear cuenta responde 503 con mensaje claro", async () => {
    const r = await api("/api/auth/signup", { method: "POST", body: { email: "a@b.mx", password: "12345678" } });
    assert.equal(r.status, 503); assert.match(r.json.error, /muy pronto/);
  });
  await s.close();
}

// ---------- Beta: con base de datos, sin cobro ----------
const db = await testDb();
{
  const s = await serve({ db, env: { ADMIN_PASSWORD: ADMIN, SUPPORT_EMAIL: "hola@odontocostos.com", BETA_TRIAL_DAYS: "60" } }), api = client(s.base);
  let tok = "", tok2 = "";
  await t("beta: configuración pública sin secretos", async () => {
    const c = await api("/api/config");
    assert.deepEqual({ ...c.json }, { accounts: true, billing: false, beta: true, founder: true, trialDays: 60, supportEmail: "hola@odontocostos.com" });
    assert.ok(!c.text.includes(ADMIN));
  });
  await t("rutas: 404 de página y de API", async () => {
    assert.equal((await api("/no-existe")).status, 404);
    const r = await api("/api/nada"); assert.equal(r.status, 404); assert.ok(r.json.error);
  });
  await t("crear cuenta: correo inválido y contraseña corta", async () => {
    let r = await api("/api/auth/signup", { method: "POST", body: { email: "ana", password: "12345678" } });
    assert.equal(r.status, 400); assert.match(r.json.error, /correo válido/);
    r = await api("/api/auth/signup", { method: "POST", body: { email: "ana@consultorio.mx", password: "1234" } });
    assert.equal(r.status, 400); assert.match(r.json.error, /8 caracteres/);
  });
  await t("crear cuenta da sesión y Pro de beta", async () => {
    const r = await api("/api/auth/signup", { method: "POST", body: { email: " Ana@Consultorio.MX ", password: "muelas-2026" } });
    assert.equal(r.status, 201); assert.ok(r.json.token.length > 30);
    assert.equal(r.json.user.email, "ana@consultorio.mx"); assert.deepEqual(r.json.entitlement, { plan: "pro", source: "beta" });
    tok = r.json.token;
    const [u] = (await db.query("select password_hash, trial_ends_at from users")).rows;
    assert.match(u.password_hash, /^scrypt\$/); assert.ok(!u.password_hash.includes("muelas"));
    const days = (new Date(u.trial_ends_at) - Date.now()) / 864e5; assert.ok(days > 59 && days < 61);
  });
  await t("el token no se guarda tal cual", async () => {
    const rows = (await db.query("select token_hash from sessions")).rows;
    assert.equal(rows.length, 1); assert.notEqual(rows[0].token_hash, tok);
  });
  await t("correo repetido responde 409", async () => {
    const r = await api("/api/auth/signup", { method: "POST", body: { email: "ana@consultorio.mx", password: "otra-clave-1" } });
    assert.equal(r.status, 409); assert.match(r.json.error, /Ya hay una cuenta/);
  });
  await t("entrar: contraseña equivocada y correcta (sin importar mayúsculas)", async () => {
    let r = await api("/api/auth/login", { method: "POST", body: { email: "ana@consultorio.mx", password: "mal" } });
    assert.equal(r.status, 401); assert.match(r.json.error, /no coinciden/);
    r = await api("/api/auth/login", { method: "POST", body: { email: "ANA@consultorio.mx", password: "muelas-2026" } });
    assert.equal(r.status, 200); tok2 = r.json.token;
  });
  await t("/api/me con y sin sesión", async () => {
    assert.equal((await api("/api/me")).status, 401);
    assert.equal((await api("/api/me", { token: "inventado" })).status, 401);
    const r = await api("/api/me", { token: tok }); assert.equal(r.json.user.email, "ana@consultorio.mx"); assert.equal(r.json.entitlement.plan, "pro");
  });
  await t("datos: vacío, formato inválido, guardar y leer", async () => {
    assert.equal((await api("/api/state", { token: tok })).json.data, null);
    assert.equal((await api("/api/state", { method: "PUT", token: tok, body: { data: { hola: 1 } } })).status, 400);
    assert.equal((await api("/api/state", { method: "PUT", body: { data: demo } })).status, 401);
    const w = await api("/api/state", { method: "PUT", token: tok, body: { data: { ...demo, clinic: { rent: 15000 } } } });
    assert.equal(w.status, 200); assert.ok(w.json.updatedAt > 0);
    const r = await api("/api/state", { token: tok2 }); assert.equal(r.json.data.clinic.rent, 15000); assert.equal(r.json.updatedAt, w.json.updatedAt);
  });
  await t("datos: aguanta un logo de 1 MB y rechaza más de 2 MB", async () => {
    const logo = "data:image/png;base64," + "A".repeat(1_000_000);
    assert.equal((await api("/api/state", { method: "PUT", token: tok, body: { data: { ...demo, clinic: { rent: 15000 }, profile: { logo } } } })).status, 200);
    const r = await api("/api/state", { method: "PUT", token: tok, body: { data: { ...demo, profile: { logo: logo + "A".repeat(1_200_000) } } } });
    assert.equal(r.status, 413); assert.match(r.json.error, /logo/);
  });
  await t("cobro en beta responde 503", async () => {
    const r = await api("/api/checkout", { method: "POST", token: tok, body: { plan: "pro", interval: "month" } });
    assert.equal(r.status, 503); assert.match(r.json.error, /beta/);
  });
  await t("encuesta con y sin cuenta", async () => {
    assert.equal((await api("/api/feedback", { method: "POST", token: tok, body: { answer: "si", comment: "<script>alert(1)</script>", plan: "pro" } })).status, 201);
    assert.equal((await api("/api/feedback", { method: "POST", body: { answer: "talvez", plan: "free" } })).status, 201);
    const rows = (await db.query("select user_id, would_pay from feedback order by id")).rows;
    assert.ok(rows[0].user_id); assert.equal(rows[1].user_id, null);
  });
  await t("soporte: pide correo y mensaje", async () => {
    assert.equal((await api("/api/support", { method: "POST", body: { email: "x", message: "hola" } })).status, 400);
    assert.equal((await api("/api/support", { method: "POST", body: { email: "luis@dental.mx", message: "Olvidé mi contraseña" } })).status, 201);
  });
  await t("panel: pide contraseña", async () => {
    assert.equal((await api("/admin")).status, 401);
    const r = await api("/admin", { headers: basic("mala") }); assert.equal(r.status, 401); assert.match(r.text, /restringido/);
  });
  await t("panel: muestra cuentas, encuesta y mensajes, con texto escapado", async () => {
    const r = await api("/admin", { headers: basic(ADMIN) });
    assert.equal(r.status, 200);
    for (const s of ["ana@consultorio.mx", "luis@dental.mx", "Olvidé mi contraseña", "Sí pagaría Pro", "&lt;script&gt;"]) assert.ok(r.text.includes(s), s);
    assert.ok(!r.text.includes("<script>alert"));
  });
  await t("panel: contraseña temporal cierra sesiones y deja entrar", async () => {
    const r = await fetch(s.base + "/admin/reset", { method: "POST", headers: { ...basic(ADMIN), "content-type": "application/x-www-form-urlencoded" }, body: "email=ana%40consultorio.mx" });
    const temp = (await r.text()).match(/monospace">([^<]+)</)[1];
    assert.equal((await api("/api/me", { token: tok })).status, 401);
    const l = await api("/api/auth/login", { method: "POST", body: { email: "ana@consultorio.mx", password: temp } });
    assert.equal(l.status, 200); tok = l.json.token;
  });
  await t("cambiar contraseña: valida la actual y cierra las otras sesiones", async () => {
    const l = await api("/api/auth/signup", { method: "POST", body: { email: "beto@sonrisa.mx", password: "primera-123" } });
    const a = l.json.token, b = (await api("/api/auth/login", { method: "POST", body: { email: "beto@sonrisa.mx", password: "primera-123" } })).json.token;
    assert.equal((await api("/api/account/password", { method: "POST", token: a, body: { current: "mala", next: "segunda-123" } })).status, 400);
    assert.equal((await api("/api/account/password", { method: "POST", token: a, body: { current: "primera-123", next: "segunda-123" } })).status, 200);
    assert.equal((await api("/api/me", { token: a })).status, 200);
    assert.equal((await api("/api/me", { token: b })).status, 401);
    assert.equal((await api("/api/auth/login", { method: "POST", body: { email: "beto@sonrisa.mx", password: "segunda-123" } })).status, 200);
  });
  await t("cerrar sesión invalida el token", async () => {
    assert.equal((await api("/api/auth/logout", { method: "POST", token: tok2, body: {} })).status, 200);
    assert.equal((await api("/api/me", { token: tok2 })).status, 401);
  });
  await t("borrar la cuenta borra sus datos", async () => {
    assert.equal((await api("/api/account", { method: "DELETE", token: tok })).status, 200);
    assert.equal((await api("/api/me", { token: tok })).status, 401);
    const left = (await db.query("select (select count(*) from users where email = 'ana@consultorio.mx')::int u, (select count(*) from clinic_states)::int c")).rows[0];
    assert.equal(left.u, 0); assert.equal(left.c, 0);
  });
  await t("demasiados intentos de entrar se frenan", async () => {
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await api("/api/auth/login", { method: "POST", body: { email: "beto@sonrisa.mx", password: "nop" } })).status;
    assert.equal(last, 429);
  });
  await s.close();
}

// ---------- Cobro activo ----------
const db2 = await testDb();
{
  const stripe = await fakeStripe();
  const s = await serve({ db: db2, stripeClient: stripe, env: { APP_URL: "https://odontocostos.test", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_FOUNDER_COUPON: "FUNDADOR", TRIAL_DAYS: "14" } }), api = client(s.base);
  const hook = (event) => {
    const payload = JSON.stringify(event);
    return fetch(s.base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  };
  const sub = (id, status, lookup, uid, extra = {}) => ({
    id, object: "subscription", customer: "cus_1", status, cancel_at_period_end: false, metadata: { user_id: uid, plan: "pro" },
    items: { data: [{ current_period_end: 1795000000, price: { lookup_key: lookup, recurring: { interval: lookup.endsWith("yearly") ? "year" : "month" } } }] }, ...extra,
  });
  const a = (await api("/api/auth/signup", { method: "POST", body: { email: "ana@x.mx", password: "muelas-2026" } })).json;
  const b = (await api("/api/auth/signup", { method: "POST", body: { email: "beto@x.mx", password: "muelas-2026" } })).json;
  const row = async (uid) => (await db2.query("select * from subscriptions where user_id = $1", [uid])).rows[0];

  await t("cobro: salud y configuración", async () => {
    assert.equal((await api("/api/health")).json.billing, true);
    const c = (await api("/api/config")).json; assert.equal(c.beta, false); assert.equal(c.founder, true); assert.equal(c.trialDays, 14);
  });
  await t("cuenta nueva tiene 14 días de prueba de Pro", async () => {
    assert.equal(a.entitlement.source, "trial"); assert.equal(a.entitlement.plan, "pro");
    const d = (new Date(a.entitlement.trialEndsAt) - Date.now()) / 864e5; assert.ok(d > 13.9 && d < 14.1);
  });
  await t("prueba vencida regresa a Gratis", async () => {
    await db2.query("update users set trial_ends_at = now() - interval '1 day' where id = $1", [b.user.id]);
    const e = (await api("/api/me", { token: b.token })).json.entitlement; assert.equal(e.plan, "free"); assert.equal(e.source, "free");
  });
  await t("pago: sin sesión, plan inválido", async () => {
    assert.equal((await api("/api/checkout", { method: "POST", body: { plan: "pro", interval: "month" } })).status, 401);
    assert.equal((await api("/api/checkout", { method: "POST", token: a.token, body: { plan: "oro", interval: "month" } })).status, 400);
  });
  await t("pago: crea cliente y sesión con cupón de fundador", async () => {
    const r = await api("/api/checkout", { method: "POST", token: a.token, body: { plan: "pro", interval: "month" } });
    assert.equal(r.status, 200); assert.equal(r.json.url, "https://checkout.stripe.test/s");
    const [, p] = stripe.calls.filter((c) => c[0] === "checkout").at(-1);
    assert.equal(p.customer, "cus_1"); assert.equal(p.client_reference_id, a.user.id); assert.equal(p.line_items[0].price, "price_pro_monthly");
    assert.deepEqual(p.discounts, [{ coupon: "FUNDADOR" }]); assert.equal(p.success_url, "https://odontocostos.test/app/?pago=ok");
    assert.equal((await db2.query("select stripe_customer_id from users where id = $1", [a.user.id])).rows[0].stripe_customer_id, "cus_1");
  });
  await t("webhook con firma falsa se rechaza", async () => {
    const r = await fetch(s.base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" }, body: "{}" });
    assert.equal(r.status, 400);
  });
  await t("checkout completado activa Pro mensual", async () => {
    stripe.__subs.sub_1 = sub("sub_1", "active", "pro_monthly", a.user.id);
    const r = await hook({ id: "evt_0", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: a.user.id } } });
    assert.equal(r.status, 200);
    const x = await row(a.user.id);
    assert.equal(x.plan, "pro"); assert.equal(x.status, "active"); assert.equal(x.interval, "month");
    assert.equal(new Date(x.current_period_end).toISOString(), new Date(1795000000 * 1000).toISOString());
    const e = (await api("/api/me", { token: a.token })).json.entitlement; assert.equal(e.source, "subscription"); assert.equal(e.plan, "pro");
  });
  await t("con suscripción activa no se puede pagar otra vez; el portal abre", async () => {
    assert.equal((await api("/api/checkout", { method: "POST", token: a.token, body: { plan: "plus", interval: "year" } })).status, 409);
    const p = await api("/api/portal", { method: "POST", token: a.token, body: {} }); assert.equal(p.json.url, "https://billing.stripe.test/p");
  });
  await t("un aviso tardío de una suscripción vieja no borra la nueva", async () => {
    await hook({ id: "evt_2", type: "customer.subscription.deleted", data: { object: sub("sub_0", "canceled", "plus_monthly", a.user.id) } });
    const x = await row(a.user.id); assert.equal(x.stripe_subscription_id, "sub_1"); assert.equal(x.status, "active");
  });
  await t("cambiar de plan en el portal actualiza el plan", async () => {
    await hook({ id: "evt_3", type: "customer.subscription.updated", data: { object: sub("sub_1", "active", "plus_yearly", a.user.id) } });
    const x = await row(a.user.id); assert.equal(x.plan, "plus"); assert.equal(x.interval, "year");
  });
  await t("cancelar deja el plan cancelado y regresa a la prueba o Gratis", async () => {
    await hook({ id: "evt_4", type: "customer.subscription.deleted", data: { object: sub("sub_1", "canceled", "plus_yearly", a.user.id) } });
    assert.equal((await row(a.user.id)).status, "canceled");
    assert.notEqual((await api("/api/me", { token: a.token })).json.entitlement.source, "subscription");
  });
  await t("suscripción sin metadatos se liga por el cliente de Stripe", async () => {
    await db2.query("update users set stripe_customer_id = 'cus_77' where id = $1", [b.user.id]);
    await hook({ id: "evt_5", type: "customer.subscription.created", data: { object: sub("sub_9", "active", "pro_yearly", undefined, { customer: "cus_77", metadata: {} }) } });
    const x = await row(b.user.id); assert.equal(x.plan, "pro"); assert.equal(x.interval, "year");
  });
  await t("borrar la cuenta cancela la suscripción en Stripe", async () => {
    assert.equal((await api("/api/account", { method: "DELETE", token: b.token })).status, 200);
    assert.ok(stripe.calls.some((c) => c[0] === "cancel" && c[1] === "sub_9"));
  });
  await s.close();
}

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
