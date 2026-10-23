// Genera los íconos de la app y la imagen para compartir en redes (public/*.png).
// Uso: FONT_DIR=<carpeta con @fontsource/red-hat-*> node scripts/make-images.mjs
import { chromium } from "playwright";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const FONT_DIR = process.env.FONT_DIR || "";
const face = (fam, id, w) => FONT_DIR ? `@font-face{font-family:"${fam}";font-weight:${w};src:url(${pathToFileURL(join(FONT_DIR, `fontsource-${id}-5.3.0/package/files/${id}-latin-${w}-normal.woff2`))})}` : "";
const fonts = [700, 800, 900].map((w) => face("Red Hat Display", "red-hat-display", w)).join("") + [500, 700].map((w) => face("Red Hat Mono", "red-hat-mono", w)).join("") + face("Red Hat Text", "red-hat-text", 500);
const tooth = (stroke) => `<path d="M11 7.5c-2.4 0-4 1.8-4 4.4 0 3.2 1.6 4.4 2.1 7.6.5 2.8.9 5.5 2.7 5.5 1.5 0 1.6-3.9 4.2-3.9s2.7 3.9 4.2 3.9c1.8 0 2.2-2.7 2.7-5.5.5-3.2 2.1-4.4 2.1-7.6 0-2.6-1.6-4.4-4-4.4-2.1 0-3.1 1-5 1s-2.9-1-5-1z" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/>`;

const icon = `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512"><rect width="32" height="32" fill="#0b7a61"/><g transform="translate(16 16) scale(.62) translate(-16 -16.5)">${tooth("#fff")}<circle cx="24.5" cy="8" r="2.6" fill="#e0607a"/></g></svg></body></html>`;

const og = `<html><head><style>${fonts}
body{margin:0;width:1200px;height:630px;background:#f3f6f3;font-family:"Red Hat Text",sans-serif;color:#10201b;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;overflow:hidden}
.l{flex:1;display:flex;flex-direction:column;gap:28px}.b{display:flex;align-items:center;gap:14px;font:800 30px "Red Hat Display"}
h1{margin:0;font:900 68px/1 "Red Hat Display";letter-spacing:-.045em}p{margin:0;font-size:24px;color:#4a5b55}
.t{width:390px;background:#fff;border-radius:6px;padding:26px 24px 44px;box-shadow:0 30px 60px -28px rgba(16,32,27,.45);transform:rotate(-2deg);font:500 19px "Red Hat Mono";position:relative}
.r{display:flex;gap:8px;padding:6px 0}.r i{flex:1;border-bottom:2px dotted #b9c6c0;transform:translateY(-5px)}.s{font-weight:700;border-top:1.5px dashed #d9e2dd;margin-top:6px;padding-top:12px}
.x{font:700 24px "Red Hat Mono"}.x span:last-child{color:#b93a2b}
.st{position:absolute;left:120px;bottom:-30px;transform:rotate(-8deg);border:3px solid #b93a2b;color:#b93a2b;border-radius:10px;padding:6px 12px;font:900 22px "Red Hat Display";text-transform:uppercase;letter-spacing:.06em;background:rgba(255,255,255,.75)}
</style></head><body><div class="l"><div class="b"><svg width="46" height="46" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0b7a61"/>${tooth("#fff")}<circle cx="24.5" cy="8" r="2.6" fill="#e0607a"/></svg>OdontoCostos</div>
<h1>Cobras la resina a $900. Hacerla te cuesta $952.</h1><p>Calcula el costo real de tu consultorio dental y cuánto cobrar.</p></div>
<div class="t"><div class="r"><span>Tu sueldo</span><i></i><span>$379</span></div><div class="r"><span>Consultorio</span><i></i><span>$395</span></div><div class="r"><span>Materiales</span><i></i><span>$178</span></div><div class="r s"><span>Te cuesta</span><i></i><span>$952</span></div><div class="r"><span>Cobras</span><i></i><span>$900</span></div><div class="r"><span>Terminal</span><i></i><span>−$18</span></div><div class="r x s"><span>Resultado</span><i></i><span>−$70</span></div><div class="st">Pierdes $70</div></div></body></html>`;

const browser = await chromium.launch();
const shot = async (html, w, h, file) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const f = join(mkdtempSync(join(tmpdir(), "oc-")), "page.html");
  writeFileSync(f, html);
  await p.goto(pathToFileURL(f).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
  console.log("✓", file);
};
await shot(icon, 512, 512, "public/icon-512.png");
await shot(icon.replace('width="512" height="512"', 'width="192" height="192"'), 192, 192, "public/icon-192.png");
await shot(og, 1200, 630, "public/og.png");
await browser.close();
