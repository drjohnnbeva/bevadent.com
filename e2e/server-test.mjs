// Prueba del servidor con un Supabase simulado: rutas, sesión, y webhooks de Stripe firmados.
// Uso: npm run build && node e2e/server-test.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import assert from "node:assert/strict";
import Stripe from "stripe";

const rows = { subscriptions: [], profiles: [{ id: "u2", email: "b@x.mx", stripe_customer_id: "cus_2" }] };
const PK = { subscriptions: "user_id", profiles: "id" };
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (url.pathname === "/auth/v1/user") {
      const ok = req.headers.authorization === "Bearer good";
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify(ok ? { id: "u1", email: "ana@x.mx", aud: "authenticated" } : { message: "invalid JWT" }));
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (!rows[table]) { res.writeHead(404); return res.end("{}"); }
    if (req.method === "GET") {
      let out = rows[table];
      for (const [k, v] of url.searchParams) if (v.startsWith("eq.")) out = out.filter((r) => String(r[k]) === v.slice(3));
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(out));
    }
    if (req.method === "POST") {
      for (const r of [].concat(JSON.parse(body))) {
        const i = rows[table].findIndex((x) => x[PK[table]] === r[PK[table]]);
        if (i >= 0) rows[table][i] = { ...rows[table][i], ...r }; else rows[table].push(r);
      }
      res.writeHead(201); return res.end();
    }
    res.writeHead(405); res.end();
  });
});
await new Promise((r) => mock.listen(0, r));

const PORT = 4100 + Math.floor(Math.random() * 500), base = `http://127.0.0.1:${PORT}`, SECRET = "whsec_test_odontocostos";
const srv = spawn(process.execPath, ["server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), APP_URL: base, SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: SECRET, SUPPORT_EMAIL: "hola@odontocostos.com" },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => { srv.stdout.on("data", (d) => String(d).includes("OdontoCostos en") && resolve()); srv.on("exit", reject); });

const stripe = new Stripe("sk_test_fake");
const hook = (event) => {
  const payload = JSON.stringify(event);
  return fetch(base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
};
const sub = (id, status, lookup, extra = {}) => ({
  id, object: "subscription", customer: "cus_1", status, cancel_at_period_end: false, metadata: { user_id: "u1", plan: "pro" },
  items: { data: [{ current_period_end: 1795000000, price: { lookup_key: lookup, recurring: { interval: lookup.endsWith("yearly") ? "year" : "month" } } }] }, ...extra,
});
const results = [];
const t = async (name, fn) => { try { await fn(); results.push("✓ " + name); } catch (e) { results.push("✗ " + name + ": " + e.message); } };

await t("salud", async () => { const j = await (await fetch(base + "/api/health")).json(); assert.equal(j.ok, true); assert.equal(j.billing, true); });
await t("configuración pública sin secretos", async () => {
  const j = await (await fetch(base + "/api/config")).json();
  assert.equal(j.supabaseAnonKey, "anon"); assert.equal(j.billing, true); assert.equal(j.founder, false);
  assert.ok(!JSON.stringify(j).includes("service")); assert.ok(!JSON.stringify(j).includes("sk_test"));
});
await t("rutas de la app regresan la app", async () => { const r = await fetch(base + "/app/cuenta"); assert.equal(r.status, 200); assert.match(await r.text(), /id="root"/); });
await t("página de venta", async () => { const r = await fetch(base + "/"); assert.equal(r.status, 200); });
await t("ruta inexistente da 404", async () => { assert.equal((await fetch(base + "/no-existe")).status, 404); });
await t("API inexistente da 404 JSON", async () => { const r = await fetch(base + "/api/nada"); assert.equal(r.status, 404); assert.ok((await r.json()).error); });
await t("pago sin sesión pide entrar", async () => { const r = await fetch(base + "/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(r.status, 401); assert.match((await r.json()).error, /Entra/); });
await t("pago con sesión vencida", async () => { const r = await fetch(base + "/api/checkout", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer bad" }, body: '{"plan":"pro","interval":"month"}' }); assert.equal(r.status, 401); });
await t("pago con plan inválido", async () => { const r = await fetch(base + "/api/checkout", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer good" }, body: '{"plan":"oro","interval":"month"}' }); assert.equal(r.status, 400); });
await t("webhook con firma falsa se rechaza", async () => { const r = await fetch(base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" }, body: "{}" }); assert.equal(r.status, 400); });
await t("webhook activa Pro mensual", async () => {
  const r = await hook({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub("sub_1", "active", "pro_monthly") } });
  assert.equal(r.status, 200);
  const row = rows.subscriptions.find((x) => x.user_id === "u1");
  assert.equal(row.plan, "pro"); assert.equal(row.status, "active"); assert.equal(row.interval, "month"); assert.equal(row.stripe_subscription_id, "sub_1");
  assert.equal(row.current_period_end, new Date(1795000000 * 1000).toISOString());
});
await t("un aviso tardío de una suscripción vieja no borra la nueva", async () => {
  await hook({ id: "evt_2", type: "customer.subscription.deleted", data: { object: sub("sub_0", "canceled", "plus_monthly") } });
  const row = rows.subscriptions.find((x) => x.user_id === "u1");
  assert.equal(row.stripe_subscription_id, "sub_1"); assert.equal(row.status, "active");
});
await t("cambiar de plan en el portal actualiza el plan", async () => {
  await hook({ id: "evt_3", type: "customer.subscription.updated", data: { object: sub("sub_1", "active", "plus_yearly") } });
  const row = rows.subscriptions.find((x) => x.user_id === "u1");
  assert.equal(row.plan, "plus"); assert.equal(row.interval, "year");
});
await t("cancelar deja el plan cancelado", async () => {
  await hook({ id: "evt_4", type: "customer.subscription.deleted", data: { object: sub("sub_1", "canceled", "plus_yearly") } });
  assert.equal(rows.subscriptions.find((x) => x.user_id === "u1").status, "canceled");
});
await t("suscripción sin metadatos se liga por el cliente de Stripe", async () => {
  await hook({ id: "evt_5", type: "customer.subscription.created", data: { object: sub("sub_9", "active", "pro_yearly", { customer: "cus_2", metadata: {} }) } });
  const row = rows.subscriptions.find((x) => x.user_id === "u2");
  assert.equal(row.plan, "pro"); assert.equal(row.interval, "year");
});

srv.kill(); mock.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
