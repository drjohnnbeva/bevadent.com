// Resumen de un mes para el correo mensual. El servidor lo usa ya compilado (build/report.mjs),
// con los mismos cálculos que la app.
import { clinicCalc, effClinic, monthPL } from "./calc";
import { mlabel, mlow, money } from "./format";
import { makeDemo, normalize } from "./model";
import type { PlanId } from "./plans";

export interface MonthSummary {
  month: string; title: string; has: boolean; ing: number; net: number; count: number; per100: number;
  perHour: string; ingText: string; netText: string; doctor: string; clinic: string; edited: boolean;
}

export function monthSummary(raw: unknown, key: string, plan: PlanId): MonthSummary {
  const st = { ...normalize(raw), plan };
  const pl = monthPL(st, key), cc = clinicCalc(effClinic(st));
  return {
    month: mlow(key), title: mlabel(key), has: pl.has && pl.ing > 0, ing: pl.ing, net: pl.net, count: pl.count,
    per100: pl.ing > 0 ? Math.round((pl.net / pl.ing) * 100) : 0,
    perHour: money(cc.perHour), ingText: money(pl.ing), netText: money(pl.net),
    doctor: st.clinic.doctor || "", clinic: st.clinic.name || "", edited: st.edited,
  };
}

/** Solo para las pruebas: un consultorio de ejemplo con meses alrededor de `now`. */
export const demoState = (now: Date) => ({ ...makeDemo(now), edited: true });
