// Prueba del sitio publicado en el navegador: servidor real + Postgres en memoria.
// Cubre la beta (crear cuenta, nube, otro dispositivo), el cobro (pago y activación) y el modo sin base de datos.
// Uso: npm run build && node e2e/live-test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { fakeStripe, serve, testDb } from "./testdb.mjs";

const SECRET = "whsec_live_test";
const db = await testDb(), db2 = await testDb();
const mail = { sent: [], send: async (m) => { mail.sent.push(m); } };
const beta = await serve({ db, mailer: mail, env: { SUPPORT_EMAIL: "hola@odontocostos.com", APP_URL: "https://odontocostos.test" } });
// El correo trae la dirección pública; en la prueba se abre la misma ruta en el servidor local.
const mailLink = () => { const u = new URL(mail.sent[0].text.match(/https:\/\/\S+reset=[\w-]+/)[0]); return beta.base + u.pathname + u.search; };
let billBase = "";
const stripe = await fakeStripe({ checkoutUrl: () => billBase + "/app/?pago=ok" });
const bill = await serve({ db: db2, stripeClient: stripe, env: { STRIPE_WEBHOOK_SECRET: SECRET, TRIAL_DAYS: "14" } });
billBase = bill.base;
const nodb = await serve({ db: null, env: {} });

const browser = await chromium.launch();
const errors = [], results = [];
const t = async (name, fn) => { try { await fn(); results.push("✓ " + name); } catch (e) { results.push("✗ " + name + ": " + e.message.split("\n")[0]); } };
async function page(base, w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: "", contentType: "text/css" }));
  await p.goto(base + "/app/");
  await p.waitForSelector(".app");
  return p;
}
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 150)); } throw new Error("tiempo agotado"); };
const cloudRent = async (d = db) => (await d.query("select data->'clinic'->>'rent' as rent from clinic_states")).rows[0]?.rent;

// ---------- Beta ----------
const g = await page(beta.base);
await t("invitado ve la invitación a crear cuenta", async () => { await g.waitForSelector(".side-plan:has-text('Crear cuenta o entrar')", { timeout: 8000 }); await g.waitForSelector(".side-plan:has-text('usa Pro gratis durante la beta')"); });
await t("invitado no puede abrir Finanzas", async () => { await g.click(".side-item:has-text('Finanzas')"); await g.waitForSelector("text=Lo que incluye Pro"); });
await t("planes en beta llevan a crear cuenta", async () => {
  await g.click("button:has-text('Ver el plan Pro')");
  await g.waitForSelector("text=Estamos en beta");
  await g.click(".plan.featured .btn:has-text('Crear cuenta y usar Pro gratis')");
  await g.waitForSelector("h1:has-text('Crea tu cuenta')");
});
await t("correo inválido y contraseña corta muestran cómo corregir", async () => {
  await g.fill("#email", "ana"); await g.fill("#password", "12345678"); await g.click("button[type=submit]");
  await g.waitForSelector("text=Escribe un correo válido");
  await g.fill("#email", "ana@consultorio.mx"); await g.fill("#password", "123"); await g.click("button[type=submit]");
  await g.waitForSelector("text=al menos 8 caracteres");
});
await t("crear cuenta: entra con Pro de beta y sube sus datos", async () => {
  await g.click(".side-item:has-text('Consultorio')"); await g.fill("#rent", "13000");
  await g.click(".side-plan button:has-text('Crear cuenta o entrar')");
  await g.fill("#email", "ana@consultorio.mx"); await g.fill("#password", "muelas-2026"); await g.click("button[type=submit]");
  await g.waitForSelector(".side-plan:has-text('Plan Pro') .pill:has-text('Beta')", { timeout: 8000 });
  await until(async () => (await cloudRent()) === "13000");
});
await t("cada cambio se guarda en la nube", async () => {
  await g.click(".side-item:has-text('Consultorio')"); await g.fill("#rent", "15000");
  await until(async () => (await cloudRent()) === "15000");
});
await t("Finanzas se abre", async () => { await g.click(".side-item:has-text('Finanzas')"); await g.waitForSelector("text=Tus números, como los ve tu contador"); });
await t("descarga la lista de precios en PDF", async () => {
  await g.click(".side-item:has-text('Lista de precios')");
  const [d] = await Promise.all([g.waitForEvent("download", { timeout: 20000 }), g.click("button:has-text('Descargar PDF')")]);
  assert.match(d.suggestedFilename(), /lista-de-precios\.pdf$/);
  assert.equal((await readFile(await d.path())).subarray(0, 5).toString(), "%PDF-");
});
await t("descarga el reporte del mes en PDF", async () => {
  await g.click(".side-item:has-text('Finanzas')");
  const [d] = await Promise.all([g.waitForEvent("download", { timeout: 20000 }), g.click("button:has-text('Descargar reporte')")]);
  assert.match(d.suggestedFilename(), /resultados-\d{4}-\d{2}\.pdf$/);
});
await t("la cuenta explica la beta y deja escribir a soporte", async () => {
  await g.click(".side-plan button:has-text('Cuenta')"); await g.waitForSelector("text=Estás en la");
  await g.fill("#smsg", "¿Puedo facturar?"); await g.click("button:has-text('Enviar mensaje')");
  await g.waitForSelector("text=Recibimos tu mensaje");
  assert.equal((await db.query("select email from support_messages")).rows[0].email, "ana@consultorio.mx");
});
await t("cambiar contraseña", async () => {
  await g.click("button:has-text('Cambiar mi contraseña')");
  await g.fill("#pwcur", "muelas-2026"); await g.fill("#pwnew", "muelas-2027"); await g.click("button:has-text('Guardar')");
  await g.waitForSelector(".toast:has-text('Contraseña cambiada')");
});
await t("cerrar sesión regresa a datos de ejemplo", async () => {
  await g.click("button:has-text('Cerrar sesión')");
  await g.waitForSelector(".side-plan:has-text('Crear cuenta o entrar')", { timeout: 8000 });
  assert.equal(JSON.parse(await g.evaluate(() => localStorage.getItem("odontocostos.v2"))).clinic.rent, 12000);
  assert.equal(await g.evaluate(() => localStorage.getItem("odontocostos.session")), null);
});
await t("al volver propone entrar con su correo", async () => {
  await g.click(".side-plan button:has-text('Crear cuenta o entrar')");
  await g.waitForSelector("h1:has-text('Entra a tu cuenta')");
  assert.equal(await g.inputValue("#email"), "ana@consultorio.mx");
  await g.waitForSelector("button:has-text('¿Olvidaste tu contraseña?')");
});

// Teléfono: entrar con la contraseña y recibir los datos
const m = await page(beta.base, 390);
await t("teléfono: contraseña equivocada avisa y ofrece recuperar", async () => {
  await m.click("button[aria-label='Tu cuenta']");
  await m.click("button[role=tab]:has-text('Ya tengo cuenta')");
  await m.fill("#email", "ana@consultorio.mx"); await m.fill("#password", "muelas-2026"); await m.click("button[type=submit]");
  await m.waitForSelector("text=no coinciden");
  await m.click("button:has-text('¿Olvidaste tu contraseña?')"); await m.waitForSelector("h1:has-text('Recupera tu cuenta')");
  assert.equal(await m.inputValue("#femail"), "ana@consultorio.mx");
  assert.equal(await m.isVisible("#fwa"), false);
  await m.click("button:has-text('Mandarme el enlace')"); await m.waitForSelector("text=Revisa tu correo");
  assert.equal(mail.sent.length, 1); assert.equal(mail.sent[0].to, "ana@consultorio.mx");
});
await t("teléfono: el enlace del correo deja poner contraseña nueva y trae los datos", async () => {
  assert.ok(mail.sent[0].text.includes("https://odontocostos.test/app/cuenta?reset="));
  await m.goto(mailLink()); await m.waitForSelector("h1:has-text('Pon tu contraseña nueva')");
  await m.fill("#newpw", "muelas-2028"); await m.click("button:has-text('Guardar y entrar')");
  await m.waitForSelector(".toast:has-text('cambiaste tu contraseña')");
  assert.ok(!m.url().includes("reset="));
  await m.click(".tab:has-text('Consultorio')");
  await until(async () => (await m.inputValue("#rent")) === "15000");
});
await t("teléfono: el mismo enlace ya no sirve", async () => {
  await m.goto(mailLink()); await m.fill("#newpw", "muelas-2029"); await m.click("button:has-text('Guardar y entrar')");
  await m.waitForSelector("text=ya venció o ya se usó");
  await m.click("button:has-text('Pedir otro enlace')"); await m.waitForSelector("h1:has-text('Tu cuenta')");
});
await t("teléfono: la sesión sigue al recargar", async () => {
  await m.reload(); await m.waitForSelector(".app");
  await m.click(".tab:has-text('Más')"); await m.click("button[aria-label='Tu cuenta']");
  await m.waitForSelector("text=Estás en la");
});

// ---------- Cobro activo ----------
const b = await page(bill.base);
await t("cobro: cuenta nueva con 14 días de prueba", async () => {
  await b.click(".side-plan button:has-text('Crear cuenta o entrar')");
  await b.fill("#email", "luis@dental.mx"); await b.fill("#password", "muelas-2026"); await b.click("button[type=submit]");
  await b.waitForSelector(".side-plan .pill:has-text('Prueba')", { timeout: 8000 });
});
await t("cobro: suscribirse abre el pago y el plan se activa al volver", async () => {
  await b.click(".side-plan button:has-text('Planes')");
  await b.waitForSelector("text=Suscribirme a Pro");
  const uid = (await db2.query("select id from users")).rows[0].id;
  stripe.__subs.sub_1 = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { user_id: uid }, items: { data: [{ current_period_end: 1795000000, price: { lookup_key: "pro_monthly", recurring: { interval: "month" } } }] } };
  await Promise.all([b.waitForURL(/pago=ok/), b.click(".plan.featured .btn")]);
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: uid } } });
  await fetch(bill.base + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  await b.waitForSelector(".toast:has-text('Listo: ya tienes Pro')", { timeout: 15000 });
});
await t("cobro: la cuenta ofrece administrar la suscripción", async () => {
  await b.click(".side-plan button:has-text('Cuenta')");
  await b.waitForSelector("button:has-text('Administrar suscripción')");
});

await t("cobro: sin correo, recuperar pide WhatsApp y deja la solicitud en el panel", async () => {
  const f = await page(bill.base, 390);
  await f.click("button[aria-label='Tu cuenta']"); await f.click("button[role=tab]:has-text('Ya tengo cuenta')");
  await f.click("button:has-text('¿Olvidaste tu contraseña?')");
  await f.fill("#femail", "luis@dental.mx"); await f.fill("#fwa", "443 555 0101");
  await f.click("button:has-text('Pedir ayuda para entrar')"); await f.waitForSelector("text=Recibimos tu solicitud");
  assert.match((await db2.query("select message from support_messages")).rows[0].message, /WhatsApp: 443 555 0101/);
});

// ---------- Sin base de datos ----------
const n = await page(nodb.base, 390);
await t("sin base: todos usan Pro en la beta, con datos en el dispositivo", async () => {
  await n.waitForSelector(".planbtn:has-text('Pro')", { timeout: 8000 });
  await n.click(".tab:has-text('Finanzas')"); await n.waitForSelector("text=Tus números, como los ve tu contador");
});
await t("sin base: la cuenta dice que se activa pronto", async () => {
  await n.click("button[aria-label='Tu cuenta']"); await n.waitForSelector("text=Las cuentas se activan muy pronto");
});

await browser.close(); await Promise.all([beta.close(), bill.close(), nodb.close()]);
if (errors.length) results.push("✗ errores en la página: " + [...new Set(errors)].join(" | "));
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
