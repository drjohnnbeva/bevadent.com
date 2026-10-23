import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { Config, Entitlement } from "../lib/cloud";
import type { Saver } from "../lib/files";
import type { State } from "../lib/model";

export type SetState = (s: State | ((prev: State) => State), markEdited?: boolean) => void;
export interface Cloud {
  /** preview: sin servidor (vista previa); loading: conectando; live: sitio publicado con cuentas y cobro */
  mode: "preview" | "loading" | "live";
  cfg: Config | null;
  session: Session | null;
  ent: Entitlement;
  sync: "idle" | "saving" | "saved" | "error";
  refresh: () => Promise<void>;
}
export interface AppCtx {
  /** Estado con el plan vigente ya aplicado */
  st: State;
  set: SetState;
  go: (path: string) => void;
  toast: (m: string) => void;
  wide: boolean;
  saver: Saver | undefined;
  cloud: Cloud;
}
export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fuera de la app");
  return c;
};
