// Preferencias de este dispositivo: tamaño de letra e instalar la app.
export type TextSize = "md" | "lg" | "xl";
export const TEXT_SIZES: [TextSize, string][] = [["md", "Normal"], ["lg", "Grande"], ["xl", "Muy grande"]];
const TEXT_KEY = "odontocostos.text";

export function getTextSize(): TextSize {
  try { const v = localStorage.getItem(TEXT_KEY); return v === "lg" || v === "xl" ? v : "md"; } catch { return "md"; }
}
export function setTextSize(v: TextSize) {
  const root = document.documentElement;
  if (v === "md") delete root.dataset.text; else root.dataset.text = v;
  try { localStorage.setItem(TEXT_KEY, v); } catch { /* sin almacenamiento */ }
}

/** Dónde se está usando, para explicar cómo instalarla. */
export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return {
    ios,
    android: /Android/.test(ua),
    // WhatsApp, Facebook e Instagram abren los enlaces en su propio navegador, que no deja instalar.
    inApp: /FBAN|FBAV|Instagram|WhatsApp|Line\//.test(ua),
    macSafari: !ios && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua),
    standalone: matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true,
  };
}

/** Chrome y Edge avisan que se puede instalar; guardamos el aviso para usarlo con nuestro botón. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
export function watchInstall() {
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e as InstallPrompt; listeners.forEach((f) => f()); });
  addEventListener("appinstalled", () => { installPrompt = null; listeners.forEach((f) => f()); });
}
export const canPromptInstall = () => !!installPrompt;
export function onInstallChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export async function promptInstall() {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null; listeners.forEach((f) => f());
  return outcome === "accepted";
}
