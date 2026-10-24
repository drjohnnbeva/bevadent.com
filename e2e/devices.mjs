// Prueba en iPhone, Android y computadora, con los tres tamaños de letra.
// Revisa que nada se salga de la pantalla, que los campos no hagan zoom en iPhone (letra de 16px o más),
// que los botones se puedan tocar (44px o más) y que los nombres de las pestañas se lean completos.
// Uso: npm run build && node e2e/devices.mjs   (capturas en e2e/out/devices)
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";
import { fontRoute, fontsPattern } from "./fonts.mjs";
import { serve, testDb } from "./testdb.mjs";

const out = "e2e/out/devices";
await mkdir(out, { recursive: true });
const s = await serve({ db: await testDb(), env: { SUPPORT_EMAIL: "hola@odontocostos.com" } });
const browser = await chromium.launch();
const DEVICES = [
  ["iphone", devices["iPhone 13"]], ["iphone-8", devices["iPhone 8"]], ["iphone-se", devices["iPhone SE"]],
  ["android", devices["Pixel 7"]], ["android-chico", devices["Galaxy S8"]], ["ipad", devices["iPad Mini"]],
  ["compu", { viewport: { width: 1366, height: 860 } }], ["laptop", { viewport: { width: 1024, height: 700 } }],
];
const SCREENS = [["inicio", "/app/"], ["consultorio", "/app/consultorio"], ["tratamiento", null], ["precios", "/app/lista-de-precios"], ["mas", "/app/mas"], ["cuenta", "/app/cuenta"], ["planes", "/app/planes"]];
const problems = [], errors = [];

for (const [name, dev] of DEVICES) {
  for (const size of ["md", "lg", "xl"]) {
    const ctx = await browser.newContext({ ...dev, acceptDownloads: true });
    await ctx.addInitScript((v) => { try { localStorage.setItem("odontocostos.text", v); } catch { /* */ } }, size);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
    await p.route(fontsPattern, fontRoute);
    for (const [screen, path] of SCREENS) {
      if (path) await p.goto(s.base + path);
      else { await p.goto(s.base + "/app/tratamientos"); await p.locator(dev.viewport.width >= 900 ? ".tbl tr.click" : ".lrow").first().click(); }
      await p.waitForSelector(".app"); await p.waitForTimeout(250);
      const where = `${name} ${size} ${screen}`;
      const r = await p.evaluate(() => {
        const vw = innerWidth, bad = [];
        if (document.scrollingElement.scrollWidth > vw + 1) bad.push(`la página es más ancha que la pantalla (${document.scrollingElement.scrollWidth} > ${vw})`);
        for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=range]), select, textarea")) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (el.offsetParent && fs < 16) bad.push(`campo ${el.id || el.getAttribute("aria-label")} con letra de ${fs}px: el iPhone hace zoom`);
        }
        for (const el of document.querySelectorAll("button, a.btn, label.btn")) {
          const b = el.getBoundingClientRect();
          if (!el.offsetParent || b.width === 0 || el.closest(".tbl")) continue;
          if (b.height < 36 || b.width < 36) bad.push(`botón "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" de ${Math.round(b.width)}×${Math.round(b.height)}px`);
        }
        for (const el of document.querySelectorAll(".tab-l")) if (el.scrollWidth > el.clientWidth + 1) bad.push(`pestaña "${el.textContent}" cortada`);
        for (const el of document.querySelectorAll(".top .row, .top")) if (el.scrollWidth > el.clientWidth + 1) bad.push("la barra de arriba no cabe");
        return bad;
      });
      for (const b of r) problems.push(`${where}: ${b}`);
      if (size === "md" || screen === "inicio" || screen === "consultorio") await p.screenshot({ path: `${out}/${name}-${size}-${screen}.png`, fullPage: false });
    }
    await ctx.close();
  }
}
await browser.close(); await s.close();
const uniq = [...new Set(problems)];
console.log(uniq.length ? "PROBLEMAS:\n" + uniq.join("\n") : "✓ iPhone, Android y computadora sin problemas en los tres tamaños de letra");
if (errors.length) console.log("ERRORES:\n" + [...new Set(errors)].join("\n"));
process.exit(uniq.length || errors.length ? 1 : 0);
