// Prueba de humo en navegador: sirve la vista previa (npm run build:preview), recorre la app
// en teléfono y computadora, en los tres planes, y guarda capturas en e2e/out.
// Uso: node e2e/smoke.mjs [carpeta]   (por defecto preview-dist)
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.argv[2] || "preview-dist";
const out = "e2e/out";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(root, normalize(p)));
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("no"); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(out, { recursive: true });

// Fuentes: con FONT_DIR (carpetas de @fontsource) se usan las reales; si no, se omiten.
const FONT_DIR = process.env.FONT_DIR;
const FAMILIES = { "Red Hat Display": ["red-hat-display", [400, 500, 600, 700, 800, 900]], "Red Hat Text": ["red-hat-text", [400, 500, 600, 700]], "Red Hat Mono": ["red-hat-mono", [400, 500, 600, 700]] };
async function fontRoute(r) {
  const u = new URL(r.request().url());
  if (!FONT_DIR) return r.fulfill({ status: 200, body: "", contentType: "text/css" });
  if (u.hostname === "fonts.gstatic.com") {
    try { return r.fulfill({ status: 200, body: await readFile(join(FONT_DIR, u.pathname.slice(1))), contentType: "font/woff2" }); } catch { return r.fulfill({ status: 404, body: "" }); }
  }
  let css = "";
  for (const [fam, [id, weights]] of Object.entries(FAMILIES)) for (const w of weights)
    css += `@font-face{font-family:"${fam}";font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/fontsource-${id}-5.3.0/package/files/${id}-latin-${w}-normal.woff2) format("woff2")}\n`;
  return r.fulfill({ status: 200, body: css, contentType: "text/css" });
}
const browser = await chromium.launch();
const errors = [];
async function open(w, h, { plan, dark, path = "/app/index.html", wait = ".app" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${w}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${w}] console: ${m.text()}`); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => fontRoute(r));
  await page.goto(base + path);
  await page.waitForSelector(wait);
  if (plan === "pro") {
    const wide = w >= 900;
    await page.click(wide ? ".side-plan button" : ".planbtn");
    await page.click(".plan.featured .btn");
    await page.click(wide ? ".side .side-item:has-text('Inicio')" : ".tab:has-text('Inicio')");
  }
  return page;
}
const overflow = async (p, tag) => { const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (sw > iw + 1) errors.push(`desborde horizontal en ${tag}: ${sw} > ${iw}`); };
const shot = (p, n, fullPage = true) => p.screenshot({ path: `${out}/${n}.png`, fullPage });
const step = async (p, label, fn) => { try { await fn(); } catch (e) { errors.push(`${label}: ${e.message.split("\n")[0]}`); } };

// Teléfono, plan Gratis
let m = await open(390, 844);
await shot(m, "m-free-home"); await overflow(m, "m-home");
for (const t of ["Consultorio", "Tratamientos", "Finanzas", "Más"]) await step(m, "tab " + t, async () => { await m.click(`.tab:has-text("${t}")`); await m.waitForTimeout(120); await shot(m, "m-free-" + t); await overflow(m, t); });
await step(m, "detalle", async () => { await m.click(".tab:has-text('Tratamientos')"); await m.click(".lrow >> nth=1"); await shot(m, "m-free-treat"); await m.click(".peek button"); await m.waitForTimeout(100); await shot(m, "m-free-price"); });
// Cambiar a Pro en la vista previa
await step(m, "plan pro", async () => { await m.click(".planbtn"); await m.click(".plan.featured .btn"); await m.waitForTimeout(100); });
await step(m, "pro finanzas", async () => { await m.click(".tab:has-text('Finanzas')"); await shot(m, "m-pro-mes"); await overflow(m, "m-mes"); });
await step(m, "pro precio", async () => { await m.click(".tab:has-text('Tratamientos')"); await m.click(".lrow >> nth=1"); await m.click(".seg button:has-text('Cuánto cobrar')"); await m.waitForTimeout(500); await shot(m, "m-pro-price"); await overflow(m, "m-price"); });
await step(m, "lista de precios", async () => {
  await m.click(".tab:has-text('Más')"); await m.click(".lrow:has-text('Lista de precios')");
  await m.waitForSelector("button:has-text('Copiar para WhatsApp')");
  await shot(m, "m-pro-prices");
});

// Computadora, plan Pro
let d = await open(1440, 900, { plan: "pro" });
await shot(d, "d-home", false); await overflow(d, "d-home");
const side = (t) => d.click(`.side .side-item:has-text("${t}")`);
for (const [t, n] of [["Consultorio", "d-clinic"], ["Tratamientos", "d-treats"], ["Finanzas", "d-mes"], ["Lista de precios", "d-prices"], ["Presupuestos", "d-quotes"], ["Promociones", "d-promos"]])
  await step(d, n, async () => { await side(t); await d.waitForTimeout(150); await shot(d, n); await overflow(d, n); });
await step(d, "d-treat", async () => { await side("Tratamientos"); await d.click(".tbl .linkbtn >> nth=1"); await d.waitForTimeout(600); await shot(d, "d-treat"); await overflow(d, "d-treat"); });
for (const s of ["Impuestos", "Metas", "Análisis"]) await step(d, s, async () => { await side("Finanzas"); await d.click(`.seg button:has-text("${s}")`); await d.waitForTimeout(150); await shot(d, "d-" + s); await overflow(d, s); });
await step(d, "planes", async () => { await d.click(".side-plan button"); await d.waitForTimeout(100); await shot(d, "d-plans"); });

// Oscuro
let k = await open(1280, 820, { dark: true, plan: "pro" });
await shot(k, "k-home", false);
await step(k, "k-treat", async () => { await k.click(".side .side-item:has-text('Tratamientos')"); await k.click(".tbl .linkbtn >> nth=1"); await k.waitForTimeout(600); await shot(k, "k-treat", false); });

// Página de venta y legales
for (const [p, n] of [["/index.html", "l-home"], ["/privacidad/index.html", "l-priv"], ["/terminos/index.html", "l-terms"]]) {
  for (const [w, h, tag] of [[390, 844, "m"], [1440, 900, "d"]]) {
    await step(null, n, async () => { const pg = await open(w, h, { path: p, wait: "body" }); await shot(pg, `${n}-${tag}`); await overflow(pg, `${n}-${tag}`); });
  }
}

console.log(errors.length ? "ERRORES:\n" + [...new Set(errors)].join("\n") : "Sin errores");
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
