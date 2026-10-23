export type Numish = number | string;

export const N = (v: unknown): number => {
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};
const fmt = (n: number) => Math.abs(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });
/** Pesos redondeados para pantalla: −$1,234 */
export const money = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(Math.abs(n));
  return (n < 0 && r > 0 ? "−$" : "$") + fmt(r);
};
/** Pesos para PDF (las fuentes estándar no tienen el signo menos tipográfico) */
export const pm = (n: number): string => {
  const r = Math.round(Math.abs(n));
  return (n < 0 && r > 0 ? "-$" : "$") + fmt(r);
};
export const pct = (n: number): string => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "—");
export const compact = (n: number): string => {
  const a = Math.abs(n), s = n < 0 ? "−$" : "$";
  return a >= 1e6 ? s + (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? s + Math.round(a / 1e3) + "K" : s + Math.round(a);
};
export const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const round50 = (n: number): number | "" => (Number.isFinite(n) && n > 0 ? Math.ceil(n / 50) * 50 : "");
export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

export const mkey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
export const mshift = (k: string, n: number) => {
  const [y, m] = k.split("-").map(Number);
  return mkey(new Date(y, m - 1 + n, 1));
};
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const mlabel = (k: string, opt?: Intl.DateTimeFormatOptions) => {
  const [y, m] = k.split("-").map(Number);
  return cap(new Date(y, m - 1, 1).toLocaleDateString("es-MX", opt || { month: "long", year: "numeric" }));
};
/** Mes en minúscula para usar a media frase: "octubre" */
export const mlow = (k: string) => mlabel(k, { month: "long" }).toLowerCase();
export const fmtDate = (d: string | Date) => {
  const x = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  return x.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
};
export const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
export const slug = (s: string) =>
  (s || "odontocostos").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "odontocostos";
