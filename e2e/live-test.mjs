// Prueba del modo publicado: servidor real + Supabase simulado + navegador.
// Cubre: invitado, enviar enlace por correo, sesión con prueba de Pro, guardar en la nube, pago y cerrar sesión.
// Uso: npm run build && node e2e/live-test.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const db = { profiles: [{ id: "u1", email: "ana@x.mx", trial_ends_at: new Date(Date.now() + 10 * 864e5).toISOString() }], subscriptions: [], clinic_states: [], feedback: [] };
const PK = { profiles: "id", subscriptions: "user_id", clinic_states: "user_id", feedback: "id" };
const log = [];
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    log.push(req.method + " " + url.pathname);
    const json = (code, data) => { res.writeHead(code, { ...cors, "content-type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
    if (url.pathname === "/auth/v1/otp") return json(200, {});
    if (url.pathname === "/auth/v1/logout") return json(204);
    if (url.pathname === "/auth/v1/user") return (req.headers.authorization || "").startsWith("Bearer eyJ") ? json(200, { id: "u1", email: "ana@x.mx", aud: "authenticated" }) : json(401, { message: "invalid" });
    const table = url.pathname.replace("/rest/v1/", "");
    if (!db[table]) return json(404, {});
    if (req.method === "GET") {
      let out = db[table];
      for (const [k, v] of url.searchParams) if (v.startsWith("eq.")) out = out.filter((r) => String(r[k]) === v.slice(3));
      return json(200, out);
    }
    if (req.method === "POST") {
      for (const r of [].concat(JSON.parse(body))) {
        const i = db[table].findIndex((x) => r[PK[table]] !== undefined && x[PK[table]] === r[PK[table]]);
        if (i >= 0) db[table][i] = { ...db[table][i], ...r }; else db[table].push({ id: db[table].length + 1, ...r });
      }
      return json(201);
    }
    json(405, {});
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const SB = `http://127.0.0.1:${mock.address().port}`;

const PORT = 4700 + Math.floor(Math.random() * 300), base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ["server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), APP_URL: base, SUPABASE_URL: SB, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_x", SUPPORT_EMAIL: "hola@odontocostos.com" },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => { srv.stdout.on("data", (d) => String(d).includes("OdontoCostos en") && resolve()); srv.on("exit", reject); });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "ana@x.mx", role: "authenticated", aud: "authenticated", exp })}.firma`;
const session = { access_token: jwt, refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: "u1", email: "ana@x.mx", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const storageKey = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;

const browser = await chromium.launch();
const errors = [], results = [];
const t = async (name, fn) => { try { await fn(); results.push("✓ " + name); } catch (e) { results.push("✗ " + name + ": " + e.message.split("\n")[0]); } };
async function page(w, withSession) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: "", contentType: "text/css" }));
  if (withSession) await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);
  await p.goto(base + "/app/");
  await p.waitForSelector(".app");
  return p;
}

// Invitado
let g = await page(1280, false);
await t("invitado ve la invitación a crear cuenta", async () => { await g.waitForSelector(".side-plan:has-text('Crear cuenta o entrar')", { timeout: 8000 }); });
await t("invitado no puede abrir Finanzas", async () => { await g.click(".side-item:has-text('Finanzas')"); await g.waitForSelector("text=Lo que incluye Pro"); });
await t("invitado no puede activar planes sin cuenta", async () => {
  await g.click("button:has-text('Ver el plan Pro')");
  await g.waitForSelector("text=Crear cuenta y probar 14 días");
  assert.equal(await g.isVisible("text=Vista previa"), false);
});
await t("correo inválido muestra cómo corregirlo", async () => {
  await g.click(".plan.featured .btn"); await g.waitForSelector("#email");
  await g.fill("#email", "ana"); await g.click("button[type=submit]");
  await g.waitForSelector("text=Escribe un correo válido");
});
await t("envía el enlace para entrar", async () => {
  await g.fill("#email", "ana@consultorio.mx"); await g.click("button[type=submit]");
  await g.waitForSelector("text=Revisa tu correo");
  assert.ok(log.includes("POST /auth/v1/otp"));
});

// Con sesión: prueba de Pro, nube y pago
let s = await page(1280, true);
await t("con sesión y prueba vigente, Pro queda activo", async () => { await s.waitForSelector(".side-plan:has-text('Plan Pro')", { timeout: 8000 }); await s.waitForSelector(".side-plan .pill:has-text('Prueba')"); });
await t("la cuenta nueva sube los datos del dispositivo", async () => {
  for (let i = 0; i < 20 && !db.clinic_states.length; i++) await s.waitForTimeout(200);
  assert.equal(db.clinic_states.length, 1); assert.equal(db.clinic_states[0].user_id, "u1"); assert.ok(db.clinic_states[0].data.clinic);
});
await t("cada cambio se guarda en la nube", async () => {
  await s.click(".side-item:has-text('Consultorio')"); await s.fill("#rent", "15000");
  for (let i = 0; i < 25 && String(db.clinic_states[0].data.clinic.rent) !== "15000"; i++) await s.waitForTimeout(200);
  assert.equal(String(db.clinic_states[0].data.clinic.rent), "15000");
});
await t("Finanzas se abre con la prueba de Pro", async () => { await s.click(".side-item:has-text('Finanzas')"); await s.waitForSelector("text=Tus números, como los ve tu contador"); });
await t("suscribirse llama al servidor con la sesión", async () => {
  await s.click(".side-plan button:has-text('Planes')");
  await s.waitForSelector("text=Suscribirme a Pro");
  const [resp] = await Promise.all([s.waitForResponse((r) => r.url().endsWith("/api/checkout")), s.click(".plan.featured .btn")]);
  // Sin acceso a Stripe en la prueba, el servidor responde con error y la app lo muestra.
  assert.equal(resp.request().headers().authorization, "Bearer " + jwt);
  await s.waitForSelector(".toast");
});
await t("descarga la lista de precios en PDF", async () => {
  await s.click(".side-item:has-text('Lista de precios')");
  const [d] = await Promise.all([s.waitForEvent("download", { timeout: 20000 }), s.click("button:has-text('Descargar PDF')")]);
  assert.match(d.suggestedFilename(), /lista-de-precios\.pdf$/);
  const head = Buffer.from(await (await import("node:fs/promises")).readFile(await d.path())).subarray(0, 5).toString();
  assert.equal(head, "%PDF-");
});
await t("descarga el reporte del mes en PDF", async () => {
  await s.click(".side-item:has-text('Finanzas')");
  const [d] = await Promise.all([s.waitForEvent("download", { timeout: 20000 }), s.click("button:has-text('Descargar reporte')")]);
  assert.match(d.suggestedFilename(), /resultados-\d{4}-\d{2}\.pdf$/);
});
await t("la cuenta muestra los días de prueba", async () => { await s.click(".side-plan button:has-text('Cuenta')"); await s.waitForSelector("text=Estás probando"); });
await t("cerrar sesión regresa a datos de ejemplo", async () => {
  await s.click("button:has-text('Cerrar sesión')");
  await s.waitForSelector(".side-plan:has-text('Crear cuenta o entrar')", { timeout: 8000 });
  const raw = await s.evaluate(() => localStorage.getItem("odontocostos.v2"));
  assert.equal(JSON.parse(raw).clinic.rent, 12000);
});

// Teléfono con sesión: datos desde la nube
let m = await page(390, true);
await t("otro dispositivo recibe los datos de la nube", async () => {
  await m.click(".tab:has-text('Consultorio')");
  for (let i = 0; i < 25 && (await m.inputValue("#rent")) !== "15000"; i++) await m.waitForTimeout(200);
  assert.equal(await m.inputValue("#rent"), "15000");
});

await browser.close(); srv.kill(); mock.close();
if (errors.length) results.push("✗ errores en la página: " + [...new Set(errors)].join(" | "));
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
