import type { Logo } from "./model";

/**
 * Guardar archivos. En el visor de claude.ai las descargas pasan por su capacidad `downloads`;
 * en el sitio publicado se usa un enlace de descarga normal.
 */
export type Saver = "anchor" | { save: (r: { filename: string; data: string | Blob }) => Promise<unknown> } | null;

let dlPromise: Promise<Saver> | null = null;
export function getSaver(): Promise<Saver> {
  const w = window as any;
  // Sin el visor de claude.ai: en el sitio publicado se descarga normal; en la vista previa no se puede.
  if (!w.claude || typeof w.claude.use !== "function") return Promise.resolve(__PREVIEW__ ? null : "anchor");
  if (!dlPromise) dlPromise = w.claude.use("downloads").then((x: any) => x || null).catch(() => null);
  return dlPromise!;
}
export async function saveFile(saver: Saver | undefined, filename: string, data: string | Blob): Promise<string> {
  if (!saver) return "unavailable";
  if (saver === "anchor") {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return "saved";
  }
  try { await saver.save({ filename, data }); return "saved"; } catch (e: any) { return (e && e.code) || "error"; }
}
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
/** Reduce el logo a 320 px y lo guarda como PNG. */
export function readLogo(file: File): Promise<Logo> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 320 / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
        res({ src: cv.toDataURL("image/png"), w, h });
      };
      img.onerror = rej; img.src = String(fr.result);
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
