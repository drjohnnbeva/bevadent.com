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
const mail = { sent: [], send: async (m) => { mail.sent.push(m); } };
{
  const s = await serve({ db, mailer: mail, env: { APP_URL: "https://odontocostos.test", ADMIN_PASSWORD: ADMIN, SUPPORT_EMAIL: "hola@odontocostos.com", SUPPORT_WHATSAPP: "452 123 4567", BETA_TRIAL_DAYS: "60" } }), api = client(s.base);
  let tok = "", tok2 = "";
  await t("beta: configuración pública sin secretos", async () => {
    const c = await api("/api/config");
    assert.deepEqual({ ...c.json }, { accounts: true, billing: false, beta: true, email: true, founder: true, trialDays: 60, trialNeedsCard: false, supportEmail: "hola@odontocostos.com", supportWhatsapp: "524521234567" });
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
  const form = (path, body, cookie) => fetch(s.base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie && { cookie }) }, body: new URLSearchParams(body) });
  let adminC = "";
  await t("panel: sin sesión muestra el formulario de contraseña, sin datos", async () => {
    const r = await api("/admin");
    assert.equal(r.status, 200); assert.match(r.text, /Contraseña del panel/); assert.match(r.text, /action="\/admin\/login"/);
    assert.ok(!r.text.includes("ana@consultorio.mx")); assert.ok(!r.text.includes("WWW-Authenticate"));
  });
  await t("panel: contraseña equivocada avisa", async () => {
    const r = await form("/admin/login", { password: "mala" });
    assert.equal(r.status, 401); assert.match(await r.text(), /Esa no es la contraseña/); assert.equal(r.headers.get("set-cookie"), null);
  });
  await t("panel: la contraseña correcta (con espacios al pegar) abre el panel 30 días", async () => {
    const r = await form("/admin/login", { password: "  " + ADMIN + " " });
    assert.equal(r.status, 303); assert.equal(r.headers.get("location"), "/admin");
    const c = r.headers.get("set-cookie");
    assert.match(c, /^oc_admin=\d+\.[\w-]+; Path=\/admin; HttpOnly; SameSite=Strict; Max-Age=2592000/);
    adminC = c.split(";")[0];
  });
  await t("panel: muestra cuentas, encuesta y mensajes, con texto escapado", async () => {
    const r = await api("/admin", { headers: { cookie: adminC } });
    assert.equal(r.status, 200);
    for (const s of ["ana@consultorio.mx", "luis@dental.mx", "Olvidé mi contraseña", "Sí pagaría Pro", "&lt;script&gt;", "Salir"]) assert.ok(r.text.includes(s), s);
    assert.ok(!r.text.includes("<script>alert"));
  });
  await t("panel: una cookie inventada o vencida no entra", async () => {
    for (const c of ["oc_admin=9999999999999.falsa", `oc_admin=${Date.now() - 1000}.${adminC.split(".")[1]}`]) assert.match((await api("/admin", { headers: { cookie: c } })).text, /Contraseña del panel/);
  });
  await t("panel: restablecer sin sesión no hace nada", async () => {
    const r = await form("/admin/reset", { email: "ana@consultorio.mx" });
    assert.equal(r.status, 303);
    assert.equal((await api("/api/me", { token: tok })).status, 200);
  });
  await t("panel: correo que no existe lo dice", async () => {
    const r = await form("/admin/reset", { email: "nadie@x.mx" }, adminC);
    assert.equal(r.status, 404); assert.match(await r.text(), /No hay una cuenta/);
  });
  await t("panel: contraseña temporal fácil de dictar, cierra sesiones y deja entrar", async () => {
    const r = await form("/admin/reset", { email: "ana@consultorio.mx" }, adminC);
    const temp = (await r.text()).match(/class="temp">([^<]+)</)[1];
    assert.match(temp, /^[a-hjkmnp-z2-9]{10}$/);
    assert.equal((await api("/api/me", { token: tok })).status, 401);
    const l = await api("/api/auth/login", { method: "POST", body: { email: "ana@consultorio.mx", password: temp } });
    assert.equal(l.status, 200); tok = l.json.token;
  });
  await t("panel: salir borra la sesión", async () => {
    const r = await form("/admin/logout", {}, adminC);
    assert.equal(r.status, 303); assert.match(r.headers.get("set-cookie"), /^oc_admin=; .*Max-Age=0/);
  });
  await t("panel: demasiados intentos se frenan", async () => {
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await form("/admin/login", { password: "nop" })).status;
    assert.equal(last, 429);
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
  await t("recuperar: correo desconocido responde igual y no manda nada", async () => {
    const r = await api("/api/auth/forgot", { method: "POST", body: { email: "nadie@x.mx" } });
    assert.equal(r.status, 200); assert.equal(r.json.via, "email"); assert.equal(mail.sent.length, 0);
  });
  await t("recuperar: el enlace del correo sirve una vez y cierra las sesiones", async () => {
    const old = (await api("/api/auth/login", { method: "POST", body: { email: "beto@sonrisa.mx", password: "segunda-123" } })).json.token;
    const r = await api("/api/auth/forgot", { method: "POST", body: { email: "Beto@Sonrisa.mx" } });
    assert.equal(r.json.via, "email"); assert.equal(mail.sent.length, 1);
    const m = mail.sent[0]; assert.equal(m.to, "beto@sonrisa.mx"); assert.match(m.subject, /contraseña/);
    const token = m.text.match(/https:\/\/odontocostos\.test\/app\/cuenta\?reset=([\w-]+)/)[1];
    assert.ok(m.html.includes("reset=" + token));
    assert.ok(!(await db.query("select token_hash from password_resets")).rows.some((x) => x.token_hash === token));
    assert.equal((await api("/api/auth/reset", { method: "POST", body: { token, password: "123" } })).status, 400);
    const ok = await api("/api/auth/reset", { method: "POST", body: { token, password: "tercera-123" } });
    assert.equal(ok.status, 200); assert.equal(ok.json.user.email, "beto@sonrisa.mx"); assert.ok(ok.json.token);
    assert.equal((await api("/api/me", { token: old })).status, 401);
    assert.equal((await api("/api/me", { token: ok.json.token })).status, 200);
    assert.equal((await api("/api/auth/login", { method: "POST", body: { email: "beto@sonrisa.mx", password: "tercera-123" } })).status, 200);
    const again = await api("/api/auth/reset", { method: "POST", body: { token, password: "cuarta-1234" } });
    assert.equal(again.status, 400); assert.match(again.json.error, /venció o ya se usó/);
  });
  await t("recuperar: un enlace vencido no sirve", async () => {
    await api("/api/auth/forgot", { method: "POST", body: { email: "beto@sonrisa.mx" } });
    const token = mail.sent.at(-1).text.match(/reset=([\w-]+)/)[1];
    await db.query("update password_resets set expires_at = now() - interval '1 minute'");
    assert.equal((await api("/api/auth/reset", { method: "POST", body: { token, password: "cuarta-1234" } })).status, 400);
  });
  await t("recuperar: demasiadas solicitudes se frenan", async () => {
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await api("/api/auth/forgot", { method: "POST", body: { email: "otro@x.mx" } })).status;
    assert.equal(last, 429);
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
  const billEnv = { APP_URL: "https://odontocostos.test", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_FOUNDER_COUPON: "FUNDADOR" };
  const s = await serve({ db: db2, stripeClient: stripe, env: billEnv }), api = client(s.base);
  // Mismo cobro y misma base, con correo: para el aviso antes de que termine la prueba.
  const mail2 = { sent: [], send: async (m) => { mail2.sent.push(m); } };
  const s2 = await serve({ db: db2, stripeClient: stripe, mailer: mail2, env: billEnv });
  const hook = (event, base = s.base) => {
    const payload = JSON.stringify(event);
    return fetch(base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
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
    const c = (await api("/api/config")).json; assert.equal(c.beta, false); assert.equal(c.founder, true); assert.equal(c.trialDays, 7); assert.equal(c.trialNeedsCard, true); assert.equal(c.email, false);
  });
  await t("sin correo, recuperar deja la solicitud en el panel", async () => {
    const r = await api("/api/auth/forgot", { method: "POST", body: { email: "ana@x.mx", whatsapp: "443 123 4567" } });
    assert.equal(r.json.via, "manual");
    const m = (await db2.query("select email, message from support_messages")).rows[0];
    assert.equal(m.email, "ana@x.mx"); assert.match(m.message, /Olvidé mi contraseña\. WhatsApp: 443 123 4567/);
  });
  await t("cuenta nueva: Gratis sin tarjeta, con la prueba de 7 días disponible", async () => {
    assert.equal(a.entitlement.source, "free"); assert.equal(a.entitlement.plan, "free"); assert.equal(a.entitlement.trialAvailable, true);
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
    assert.equal(p.subscription_data.trial_period_days, 7); assert.equal(p.payment_method_collection, "always");
    assert.equal(p.subscription_data.trial_settings.end_behavior.missing_payment_method, "cancel");
    assert.match(p.custom_text.submit.message, /Hoy no se cobra nada.*3 días antes/);
    assert.equal((await db2.query("select stripe_customer_id from users where id = $1", [a.user.id])).rows[0].stripe_customer_id, "cus_1");
  });
  await t("webhook con firma falsa se rechaza", async () => {
    const r = await fetch(s.base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" }, body: "{}" });
    assert.equal(r.status, 400);
  });
  await t("checkout completado: Pro en prueba, con la fecha del primer cobro", async () => {
    stripe.__subs.sub_1 = sub("sub_1", "trialing", "pro_monthly", a.user.id, { trial_end: 1794000000 });
    const r = await hook({ id: "evt_0", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: a.user.id } } });
    assert.equal(r.status, 200);
    const x = await row(a.user.id);
    assert.equal(x.plan, "pro"); assert.equal(x.status, "trialing"); assert.equal(x.interval, "month");
    assert.equal(new Date(x.current_period_end).toISOString(), new Date(1795000000 * 1000).toISOString());
    const e = (await api("/api/me", { token: a.token })).json.entitlement;
    assert.equal(e.source, "subscription"); assert.equal(e.plan, "pro"); assert.equal(e.status, "trialing");
    assert.equal(new Date(e.trialEnd).toISOString(), new Date(1794000000 * 1000).toISOString());
    assert.equal((await db2.query("select card_trial_used from users where id = $1", [a.user.id])).rows[0].card_trial_used, true);
  });
  await t("aviso 3 días antes del cobro: correo con fecha, monto y cómo cancelar", async () => {
    const r = await hook({ id: "evt_tw", type: "customer.subscription.trial_will_end", data: { object: sub("sub_1", "trialing", "pro_monthly", a.user.id, { trial_end: 1794000000 }) } }, s2.base);
    assert.equal(r.status, 200); assert.equal(mail2.sent.length, 1);
    const m = mail2.sent[0];
    assert.equal(m.to, "ana@x.mx"); assert.match(m.subject, /Tu prueba de Pro termina el/);
    assert.match(m.text, /se cobran \$99 a tu tarjeta/); assert.match(m.text, /cancela antes.*no se cobra nada/s); assert.ok(m.text.includes("https://odontocostos.test/app/cuenta"));
  });
  await t("si ya canceló la prueba, no se manda el aviso", async () => {
    await hook({ id: "evt_tw2", type: "customer.subscription.trial_will_end", data: { object: sub("sub_1", "trialing", "pro_monthly", a.user.id, { trial_end: 1794000000, cancel_at_period_end: true }) } }, s2.base);
    assert.equal(mail2.sent.length, 1);
    await hook({ id: "evt_tw3", type: "customer.subscription.updated", data: { object: sub("sub_1", "active", "pro_monthly", a.user.id) } });
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
  await t("quien ya usó la prueba paga desde el primer día", async () => {
    const r = await api("/api/checkout", { method: "POST", token: a.token, body: { plan: "pro", interval: "month" } });
    assert.equal(r.status, 200);
    const [, p] = stripe.calls.filter((c) => c[0] === "checkout").at(-1);
    assert.equal(p.subscription_data.trial_period_days, undefined); assert.equal(p.payment_method_collection, undefined);
    assert.notEqual((await api("/api/me", { token: a.token })).json.entitlement.trialAvailable, true);
  });
  await t("suscripción sin metadatos se liga por el cliente de Stripe", async () => {
    await db2.query("update users set stripe_customer_id = 'cus_77' where id = $1", [b.user.id]);
    await hook({ id: "evt_5", type: "customer.subscription.created", data: { object: sub("sub_9", "active", "pro_yearly", undefined, { customer: "cus_77", metadata: {} }) } });
    const x = await row(b.user.id); assert.equal(x.plan, "pro"); assert.equal(x.interval, "year");
  });
  // ---------- Invita a un colega ----------
  const paid = (customer, amount_paid, id) => hook({ id, type: "invoice.paid", data: { object: { id: "in_" + id, customer, amount_paid } } });
  let code = "", carla = null;
  await t("invitar: cada cuenta tiene su enlace", async () => {
    const r = await api("/api/referral", { token: a.token });
    assert.equal(r.status, 200); assert.match(r.json.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(r.json.link, "https://odontocostos.test/?ref=" + r.json.code); assert.equal(r.json.invited, 0); assert.equal(r.json.days, 30);
    assert.equal((await api("/api/referral", { token: a.token })).json.code, r.json.code);
    assert.equal((await api("/api/referral")).status, 401);
    code = r.json.code;
  });
  await t("invitar: el colega invitado prueba 30 días en vez de 7", async () => {
    carla = (await api("/api/auth/signup", { method: "POST", body: { email: "carla@x.mx", password: "muelas-2026", ref: code.toLowerCase() } })).json;
    assert.equal(carla.entitlement.trialAvailable, true); assert.equal(carla.entitlement.trialDays, 30);
    const otro = (await api("/api/auth/signup", { method: "POST", body: { email: "dani@x.mx", password: "muelas-2026", ref: "ZZZZZZ" } })).json;
    assert.equal(otro.entitlement.trialDays, 7);
    const r = await api("/api/checkout", { method: "POST", token: carla.token, body: { plan: "pro", interval: "month" } });
    assert.equal(r.status, 200);
    const [, p] = stripe.calls.filter((c) => c[0] === "checkout").at(-1);
    assert.equal(p.subscription_data.trial_period_days, 30); assert.match(p.custom_text.submit.message, /30 días/);
  });
  await t("invitar: el premio llega hasta que el colega paga, y una sola vez", async () => {
    const cus = (await db2.query("select stripe_customer_id from users where id = $1", [carla.user.id])).rows[0].stripe_customer_id;
    await paid(cus, 0, "r0");
    assert.equal((await api("/api/referral", { token: a.token })).json.paid, 0);
    assert.equal((await api("/api/me", { token: a.token })).json.entitlement.source, "free");
    await paid(cus, 9900, "r1"); await paid(cus, 9900, "r2");
    const r = (await api("/api/referral", { token: a.token })).json; assert.equal(r.invited, 1); assert.equal(r.paid, 1);
    const e = (await api("/api/me", { token: a.token })).json.entitlement;
    assert.equal(e.source, "trial"); assert.equal(e.plan, "pro");
    const d = (new Date(e.trialEndsAt) - Date.now()) / 864e5; assert.ok(d > 29.9 && d < 30.1, String(d));
  });
  await t("invitar: si quien invita ya paga, el mes se descuenta de su próximo cobro", async () => {
    const code2 = (await api("/api/referral", { token: b.token })).json.code;
    const eli = (await api("/api/auth/signup", { method: "POST", body: { email: "eli@x.mx", password: "muelas-2026", ref: code2 } })).json;
    await db2.query("update users set stripe_customer_id = 'cus_eli' where id = $1", [eli.user.id]);
    await paid("cus_eli", 9900, "r3");
    const credit = stripe.calls.find((c) => c[0] === "credit");
    assert.ok(credit, "sin crédito"); assert.equal(credit[1], "cus_77");
    assert.deepEqual(credit[2], { amount: -825, currency: "mxn", description: "Un mes gratis por invitar a un colega" });
  });
  await t("borrar la cuenta cancela la suscripción en Stripe", async () => {
    assert.equal((await api("/api/account", { method: "DELETE", token: b.token })).status, 200);
    assert.ok(stripe.calls.some((c) => c[0] === "cancel" && c[1] === "sub_9"));
  });
  await s.close(); await s2.close();
}

// ---------- Resumen mensual por correo ----------
{
  const report = await import("../build/report.mjs");
  const db3 = await testDb();
  let fail = 0;
  const mail3 = { sent: [], send: async (m) => { if (fail > 0) { fail--; throw new Error("SMTP caído"); } mail3.sent.push(m); } };
  const s = await serve({ db: db3, mailer: mail3, report, env: { APP_URL: "https://odontocostos.test" } }), api = client(s.base);
  const nov = new Date("2026-11-02T16:00:00Z"); // 2 de noviembre, 10 de la mañana en la Ciudad de México
  const user = async (email, data) => {
    const r = (await api("/api/auth/signup", { method: "POST", body: { email, password: "muelas-2026" } })).json;
    if (data) assert.equal((await api("/api/state", { method: "PUT", token: r.token, body: { data } })).status, 200);
    return r;
  };
  const demo = report.demoState(new Date("2026-11-15T12:00:00Z"));
  const ana = await user("ana@x.mx", { ...demo, clinic: { ...demo.clinic, doctor: "Dra. Ana López" } });
  await user("beto@x.mx", { ...demo, edited: false });
  await user("carla@x.mx");
  const dani = await user("dani@x.mx", demo);
  await t("mensual: se puede apagar desde la cuenta", async () => {
    assert.equal((await api("/api/me", { token: dani.token })).json.user.monthlyEmail, true);
    assert.equal((await api("/api/account/prefs", { method: "POST", token: dani.token, body: { monthlyEmail: false } })).status, 200);
    assert.equal((await api("/api/me", { token: dani.token })).json.user.monthlyEmail, false);
  });
  await t("mensual: fuera del 1 al 5 o de noche no se manda nada", async () => {
    assert.equal(await s.app.runMonthly(new Date("2026-11-10T16:00:00Z")), 0);
    assert.equal(await s.app.runMonthly(new Date("2026-11-02T03:00:00Z")), 0);
    assert.equal(mail3.sent.length, 0);
  });
  await t("mensual: si el correo falla se intenta la siguiente hora", async () => {
    fail = 1;
    assert.equal(await s.app.runMonthly(nov), 0);
    assert.equal((await db3.query("select count(*)::int n from monthly_emails")).rows[0].n, 0);
  });
  await t("mensual: el resumen de octubre dice cuánto cobró y cuánto le quedó", async () => {
    assert.equal(await s.app.runMonthly(nov), 1);
    const m = mail3.sent[0];
    assert.equal(m.to, "ana@x.mx");
    assert.match(m.subject, /^Octubre en tu consultorio: te quedaron \$[\d,]+$/);
    assert.match(m.text, /^Hola, Dra\. Ana López:/); assert.match(m.text, /En octubre cobraste \$[\d,]+ en \d+ tratamientos\./);
    assert.match(m.text, /de cada \$100 que cobraste te quedaron \$\d+/);
    assert.match(m.list.unsubscribe.url, /^https:\/\/odontocostos\.test\/api\/email\/unsubscribe\?t=[0-9a-f-]{36}$/);
    assert.ok(m.html.includes("Date de baja"));
  });
  await t("mensual: no se repite, ni a quien sigue con el ejemplo o sin datos", async () => {
    assert.equal(await s.app.runMonthly(nov), 0);
    assert.equal(await s.app.runMonthly(new Date("2026-11-04T20:00:00Z")), 0);
    assert.equal(mail3.sent.length, 1);
  });
  await t("mensual: el enlace del correo da de baja", async () => {
    const url = new URL(mail3.sent[0].list.unsubscribe.url);
    const r = await api(url.pathname + url.search);
    assert.equal(r.status, 200); assert.match(r.text, /ya no te mandamos el resumen/);
    assert.equal((await api("/api/me", { token: ana.token })).json.user.monthlyEmail, false);
    assert.match((await api("/api/email/unsubscribe?t=nada")).text, /ya no sirve/);
  });
  await t("mensual: en enero llega el de diciembre; sin capturas, pide capturar", async () => {
    await user("eva@x.mx", demo);
    assert.equal(await s.app.runMonthly(new Date("2027-01-03T16:00:00Z")), 1);
    const m = mail3.sent.at(-1);
    assert.equal(m.to, "eva@x.mx"); assert.equal(m.subject, "¿Cómo te fue en diciembre?"); assert.match(m.text, /Capturar diciembre: https:\/\/odontocostos\.test\/app\/finanzas/);
  });
  await s.close();
}

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
