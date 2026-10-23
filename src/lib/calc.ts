import { N, round50, sum } from "./format";
import type { Clinic, Employee, Material, Payroll, Quote, State, Treatment } from "./model";
import { can } from "./plans";
import { isrTarifa, resicoISR } from "./tax";

export type Status = "good" | "warn" | "bad" | "none";

/** En Gratis el modelo es simple: sin reposición de equipo, un sillón y sin comisión de terminal. */
export function effClinic(st: State): Clinic {
  const c = st.clinic;
  return can(st.plan, "plus") ? c : { ...c, equipValue: 0, units: 1, cardShare: 0 };
}

export interface ClinicCalc {
  depreciation: number; cashFixed: number; ownerPay: number; totalMonthly: number;
  available: number; occupied: number; perHour: number; perHourFull: number; effFee: number;
}
export function clinicCalc(c: Clinic): ClinicCalc {
  // Reserva para reponer equipo: no sale cada mes, pero el precio debe cubrirla.
  const depreciation = N(c.equipYears) > 0 ? N(c.equipValue) / N(c.equipYears) / 12 : 0;
  const cashFixed = N(c.rent) + N(c.services) + N(c.staff) + N(c.software) + N(c.ads) + N(c.other);
  const ownerPay = N(c.ownerPay); // se cuenta UNA sola vez, aquí
  const totalMonthly = cashFixed + depreciation + ownerPay;
  const available = N(c.hoursDay) * N(c.daysMonth) * Math.max(1, N(c.units));
  const occupied = (available * N(c.occupancy)) / 100;
  const perHour = occupied > 0 ? totalMonthly / occupied : NaN;
  const perHourFull = available > 0 ? totalMonthly / available : NaN;
  const effFee = ((N(c.cardShare) / 100) * N(c.cardFee)) / 100; // comisión promedio sobre el precio
  return { depreciation, cashFixed, ownerPay, totalMonthly, available, occupied, perHour, perHourFull, effFee };
}

export interface TreatCalc {
  hours: number; time: number; materials: number; fixedFee: number; pctFee: number;
  direct: number; cost: number; k: number; minPrice: number; recPrice: number;
}
export function treatCalc(t: Treatment, mats: Material[], cc: ClinicCalc, target: unknown): TreatCalc {
  const hours = N(t.minutes) / 60, time = hours * cc.perHour;
  const materials = (t.items || []).reduce((s, [id, q]) => {
    const m = mats.find((x) => x.id === id);
    return s + (m ? N(m.cost) * N(q) : 0);
  }, 0);
  const pctFee = t.feeMode === "pct" ? N(t.feePct) / 100 : 0;
  const fixedFee = t.feeMode === "pct" ? 0 : N(t.fees);
  const direct = materials + N(t.lab) + fixedFee + N(t.other);
  const cost = time + direct;
  const k = cc.effFee + pctFee, m = N(target) / 100;
  const minPrice = k < 1 ? cost / (1 - k) : NaN; // cubre costo y comisiones, ganancia 0
  const recPrice = 1 - k - m > 0 ? cost / (1 - k - m) : NaN; // margen sobre el PRECIO, no recargo sobre el costo
  return { hours, time, materials, fixedFee, pctFee, direct, cost, k, minPrice, recPrice };
}
export const outcome = (price: number, r: TreatCalc) => {
  const profit = price * (1 - r.k) - r.cost, base = r.cost + price * r.pctFee;
  return { profit, margin: price > 0 ? profit / price : NaN, markup: base > 0 ? profit / base : NaN };
};
/** Precio que cobra el dentista; si no lo ha puesto, el recomendado redondeado. */
export const priceOf = (t: Treatment, r: TreatCalc) => (N(t.price) > 0 ? N(t.price) : Number(round50(r.recPrice)) || 0);
export const statusOf = (price: number, r: TreatCalc, target: unknown): Status => {
  if (!(price > 0)) return "none";
  const o = outcome(price, r);
  if (o.profit < 0) return "bad";
  if (o.margin < N(target) / 100 - 0.0005) return "warn";
  return "good";
};

/** Costo mensual real de una persona: aguinaldo 15 días, prima vacacional 25% de 12 días, IMSS e ISN. */
export function empCost(e: Employee, p: Payroll) {
  const s = N(e.salary), agui = s / 24, prima = s / 120, soc = e.imss ? (s * (N(p.cargas) + N(p.isn))) / 100 : 0;
  return { agui, prima, soc, cost: s + agui + prima + soc };
}

export interface TreatRow { id: string; t: Treatment; r: TreatCalc; own: boolean; price: number; s: Status | null }
export function treatRows(st: State): TreatRow[] {
  const plus = can(st.plan, "plus"), cc = clinicCalc(effClinic(st));
  return st.order.map((id) => {
    const t = st.treatments[id], r = treatCalc(t, st.materials, cc, st.clinic.target), own = N(t.price) > 0;
    return { id, t, r, own, price: plus && own ? N(t.price) : r.recPrice, s: plus ? statusOf(own ? N(t.price) : 0, r, st.clinic.target) : null };
  });
}

export interface PL {
  key: string; has: boolean; ing: number; card: number; directFixed: number; pctFees: number; count: number; hours: number;
  rows: { id: string; name: string; n: number; p: number }[]; extras: number; fixed: number; reserve: number; cc: ClinicCalc;
  direct: number; gross: number; op: number; taxBase: number; isrResico: number; isrProf: number; isr: number; net: number; salary: number;
}
type PLBase = Omit<PL, "direct" | "gross" | "op" | "taxBase" | "isrResico" | "isrProf" | "isr" | "net" | "salary">;

export function monthPL(st: State, key: string): PL {
  const cc = clinicCalc(effClinic(st)), mo = st.months[key];
  const o: PLBase = { key, has: false, ing: 0, card: 0, directFixed: 0, pctFees: 0, count: 0, hours: 0, rows: [], extras: 0, fixed: cc.cashFixed, reserve: cc.depreciation, cc };
  if (mo) {
    for (const id of st.order) {
      const t = st.treatments[id], n = N(mo.counts && mo.counts[id]);
      if (!t || n <= 0) continue;
      const r = treatCalc(t, st.materials, cc, st.clinic.target), p = priceOf(t, r);
      o.ing += n * p; o.card += n * p * cc.effFee; o.directFixed += n * r.direct; o.pctFees += n * p * r.pctFee;
      o.count += n; o.hours += n * r.hours; o.rows.push({ id, name: t.name, n, p });
    }
    o.extras = sum(mo.extras || [], (e) => N(e.amount));
    o.has = o.count > 0 || o.extras > 0;
  }
  return finishPL(st, o);
}
export function finishPL(st: State, b: PLBase): PL {
  const direct = b.directFixed + b.pctFees, gross = b.ing - b.card - direct, op = gross - b.fixed - b.extras;
  const taxBase = op - b.reserve, isrResico = resicoISR(b.ing), isrProf = isrTarifa(taxBase);
  const isr = st.tax.regime === "prof" ? isrProf : isrResico;
  return { ...b, direct, gross, op, taxBase, isrResico, isrProf, isr, net: op - b.reserve - isr, salary: N(st.clinic.ownerPay) };
}
export function scenario(st: State, pl: PL, pu: number, vol: number, addFixed: number): PL {
  const a = (1 + pu) * (1 + vol), b = 1 + vol;
  return finishPL(st, { ...pl, ing: pl.ing * a, card: pl.card * a, pctFees: pl.pctFees * a, directFixed: pl.directFixed * b, fixed: pl.fixed + addFixed });
}
export function catalogRatio(st: State) {
  const cc = clinicCalc(effClinic(st));
  let s = 0, n = 0;
  for (const id of st.order) {
    const t = st.treatments[id], r = treatCalc(t, st.materials, cc, st.clinic.target), p = priceOf(t, r);
    if (p > 0) { s += (p * (1 - r.k) - r.direct) / p; n++; }
  }
  return n ? s / n : 0;
}
export function avgPrice(st: State) {
  const cc = clinicCalc(effClinic(st));
  const ps = st.order.map((id) => { const t = st.treatments[id]; return priceOf(t, treatCalc(t, st.materials, cc, st.clinic.target)); }).filter((p) => p > 0);
  return ps.length ? sum(ps, (p) => p) / ps.length : 0;
}
/** Cuánto necesitas cobrar al mes para que te quede `target` libre, después de impuestos. */
export function billingFor(st: State, pl: PL, target: number) {
  const ratio = pl.ing > 0 ? pl.gross / pl.ing : catalogRatio(st);
  if (!(ratio > 0)) return NaN;
  const net = (B: number) => {
    const base = B * ratio - pl.fixed - pl.extras - pl.reserve;
    return base - (st.tax.regime === "prof" ? isrTarifa(base) : resicoISR(B));
  };
  let lo = 0, hi = Math.max(1e5, ((pl.fixed + pl.extras + pl.reserve + target) / ratio) * 2);
  for (let i = 0; i < 30 && net(hi) < target; i++) hi *= 2;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (net(mid) < target) lo = mid; else hi = mid; }
  return hi;
}
/** Para un aumento de precios, cuántos pacientes podrías perder y ganar lo mismo. */
export function lossTolerance(st: State, pl: PL, pu: number, addFixed: number): number | null {
  if (!(pu > 0)) return null;
  let lo = -0.95, hi = 0;
  if (scenario(st, pl, pu, lo, addFixed).net >= pl.net) return null;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (scenario(st, pl, pu, m, addFixed).net >= pl.net) hi = m; else lo = m; }
  return -hi;
}
export function quoteCalc(st: State, q: Quote) {
  const cc = clinicCalc(effClinic(st));
  let sub = 0, cost = 0, pctBase = 0;
  const lines = q.items.map((it) => {
    const t = st.treatments[it.tid], r = t ? treatCalc(t, st.materials, cc, st.clinic.target) : null, imp = N(it.price) * N(it.qty);
    sub += imp;
    if (r) { cost += r.cost * N(it.qty); pctBase += imp * r.pctFee; }
    return { ...it, name: t ? t.name : it.name || "Tratamiento", imp };
  });
  const d = Math.min(100, Math.max(0, N(q.discount))) / 100, total = sub * (1 - d), months = q.payment === "contado" ? 0 : N(q.payment);
  const fee = months ? N(st.msi[months]) / 100 : cc.effFee;
  return { lines, sub, disc: sub * d, d, total, months, monthly: months ? total / months : 0, profit: total * (1 - fee) - pctBase * (1 - d) - cost };
}
