import { useSyncExternalStore } from "react";

/**
 * Rutas de la app bajo /app. En la vista previa (o servida en otra ruta) usa memoria,
 * porque ahí la barra de direcciones no se puede cambiar.
 */
const BASE = "/app";
const useHistory = !__PREVIEW__ && typeof location !== "undefined" && (location.pathname === BASE || location.pathname.startsWith(BASE + "/"));
let memPath = "/";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function current(): string {
  if (!useHistory) return memPath;
  const p = location.pathname.slice(BASE.length) || "/";
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
let snap = current();
if (typeof window !== "undefined") window.addEventListener("popstate", () => { snap = current(); emit(); });

export function navigate(path: string, replace = false) {
  if (useHistory) {
    const url = BASE + (path === "/" ? "/" : path);
    if (replace) history.replaceState(null, "", url); else history.pushState(null, "", url);
  } else memPath = path;
  snap = current();
  emit();
  window.scrollTo(0, 0);
}
export function usePath() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snap, () => "/");
}

export type Route =
  | { name: "home" } | { name: "clinic" } | { name: "treatments" } | { name: "treatment"; id: string }
  | { name: "finance" } | { name: "more" } | { name: "prices" } | { name: "promos" } | { name: "quotes" }
  | { name: "learn" } | { name: "profile" } | { name: "plans" } | { name: "backup" } | { name: "account" };

const SIMPLE: Record<string, Route["name"]> = {
  "/": "home", "/consultorio": "clinic", "/tratamientos": "treatments", "/finanzas": "finance", "/mas": "more",
  "/lista-de-precios": "prices", "/promociones": "promos", "/presupuestos": "quotes", "/aprende": "learn",
  "/mi-consultorio": "profile", "/planes": "plans", "/respaldo": "backup", "/cuenta": "account",
};
export function parse(path: string): Route {
  const m = path.match(/^\/tratamientos\/([^/]+)$/);
  if (m) return { name: "treatment", id: decodeURIComponent(m[1]) };
  return { name: SIMPLE[path] || "home" } as Route;
}
export const PATH: Record<Exclude<Route["name"], "treatment">, string> = Object.fromEntries(Object.entries(SIMPLE).map(([p, n]) => [n, p])) as any;
export const treatmentPath = (id: string) => "/tratamientos/" + encodeURIComponent(id);
