// Fuentes para las pruebas: con FONT_DIR (carpetas de @fontsource) se usan las reales; si no, se omiten.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FONT_DIR = process.env.FONT_DIR;
const FAMILIES = { "Red Hat Display": ["red-hat-display", [400, 500, 600, 700, 800, 900]], "Red Hat Text": ["red-hat-text", [400, 500, 600, 700]], "Red Hat Mono": ["red-hat-mono", [400, 500, 600, 700]] };
export async function fontRoute(r) {
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
export const fontsPattern = /fonts\.(googleapis|gstatic)\.com/;
