import { describe, expect, it } from "vitest";
import { billingFor, clinicCalc, effClinic, empCost, lossTolerance, monthPL, outcome, quoteCalc, scenario, statusOf, treatCalc } from "../src/lib/calc";
import { mkey, money, mshift, round50 } from "../src/lib/format";
import { makeDemo, normalize } from "../src/lib/model";
import { isrTarifa, resicoISR, resicoRate } from "../src/lib/tax";

const demo = (plan: "free" | "plus" | "pro" = "pro") => ({ ...makeDemo(new Date(2026, 9, 23)), plan });
const KEY = "2026-10";

describe("ISR 2026 y RESICO", () => {
  it("aplica la tarifa mensual del Anexo 8", () => {
    expect(isrTarifa(844.59)).toBeCloseTo(16.22, 2);
    expect(isrTarifa(30000)).toBeCloseTo(4519.65, 2);
    expect(isrTarifa(50000)).toBeCloseTo(9107.82, 2);
    expect(isrTarifa(0)).toBe(0);
    expect(isrTarifa(-100)).toBe(0);
  });
  it("usa la tasa de RESICO del total cobrado", () => {
    expect(resicoRate(25000)).toBe(1);
    expect(resicoRate(25000.01)).toBe(1.1);
    expect(resicoISR(100000)).toBe(2000);
    expect(resicoISR(250000)).toBe(6250);
  });
});

describe("costo por hora", () => {
  it("cuenta sueldo, gastos y reposición de equipo en Plus", () => {
    const cc = clinicCalc(effClinic(demo("plus")));
    expect(cc.totalMonthly).toBeCloseTo(81687.5, 1);
    expect(cc.occupied).toBeCloseTo(105.6, 5);
    expect(Math.round(cc.perHour)).toBe(774);
    expect(cc.effFee).toBeCloseTo(0.0203, 6);
  });
  it("Gratis usa el modelo simple sin equipo ni terminal", () => {
    const cc = clinicCalc(effClinic(demo("free")));
    expect(cc.depreciation).toBe(0);
    expect(cc.effFee).toBe(0);
    expect(Math.round(cc.perHour)).toBe(729);
  });
});

describe("precio de un tratamiento", () => {
  const st = demo("plus"), cc = clinicCalc(effClinic(st));
  const r = treatCalc(st.treatments.resina, st.materials, cc, 30);
  it("calcula costo, mínimo y recomendado con margen sobre el precio", () => {
    expect(Math.round(r.cost)).toBe(952);
    expect(Math.round(r.minPrice)).toBe(971);
    expect(Math.round(r.recPrice)).toBe(1400);
    expect(outcome(r.recPrice, r).margin).toBeCloseTo(0.3, 6);
  });
  it("marca la resina de $900 como pérdida", () => {
    expect(statusOf(900, r, 30)).toBe("bad");
    expect(statusOf(1200, r, 30)).toBe("warn");
    expect(statusOf(1400, r, 30)).toBe("good");
    expect(statusOf(0, r, 30)).toBe("none");
  });
  it("redondea el recomendado a $50", () => {
    expect(round50(1399.2)).toBe(1400);
    expect(round50(NaN)).toBe("");
  });
  it("un especialista por porcentaje entra en el precio", () => {
    const t = { ...st.treatments.endodoncia, feeMode: "pct" as const, feePct: 40 };
    const rp = treatCalc(t, st.materials, cc, 30);
    expect(rp.pctFee).toBe(0.4);
    expect(outcome(rp.recPrice, rp).margin).toBeCloseTo(0.3, 6);
  });
});

describe("estado de resultados", () => {
  const st = demo("pro"), pl = monthPL(st, KEY);
  it("suma ingresos, costos e ISR del mes", () => {
    expect(pl.ing).toBe(142200);
    expect(Math.round(pl.card)).toBe(2887);
    expect(Math.round(pl.direct)).toBe(26342);
    expect(pl.fixed).toBe(37000);
    expect(Math.round(pl.isrResico)).toBe(2844);
    expect(Math.round(pl.isrProf)).toBe(15121);
    expect(Math.round(pl.net)).toBe(68440);
  });
  it("encuentra el punto de equilibrio y la meta", () => {
    expect(Math.round(billingFor(st, pl, 0))).toBe(53483);
    const goal = billingFor(st, pl, 40000);
    expect(Math.round(goal)).toBe(105478);
  });
  it("simula subir precios", () => {
    expect(Math.round(scenario(st, pl, 0.1, 0, 0).net - pl.net)).toBe(13647);
    const lose = lossTolerance(st, pl, 0.1, 0)!;
    expect(lose).toBeGreaterThan(0.1);
    expect(lose).toBeLessThan(0.12);
  });
  it("un mes sin registros no tiene datos", () => {
    expect(monthPL(st, mshift(KEY, 1)).has).toBe(false);
  });
});

describe("personal y presupuestos", () => {
  it("calcula el costo real de una asistente con IMSS", () => {
    expect(Math.round(empCost({ id: "x", role: "", salary: 9000, imss: true }, { cargas: 26, isn: 3, list: [] }).cost)).toBe(12060);
  });
  it("aplica descuento y meses sin intereses", () => {
    const st = demo("pro");
    const qc = quoteCalc(st, { id: "q", folio: "P-0001", patient: "", date: "2026-10-23", items: [{ tid: "resina", name: "Resina", qty: 1, price: 900 }, { tid: "endodoncia", name: "Endodoncia", qty: 1, price: 3500 }], discount: 10, payment: "6", notes: "" });
    expect(qc.sub).toBe(4400);
    expect(qc.total).toBe(3960);
    expect(qc.monthly).toBe(660);
    expect(Math.round(qc.profit)).toBe(1046);
  });
});

describe("datos", () => {
  it("normaliza respaldos incompletos", () => {
    const s = normalize({ clinic: { rent: 9000 }, treatments: { a: { name: "X" } }, plan: "nada" });
    expect(s.clinic.rent).toBe(9000);
    expect(s.clinic.ownerPay).toBe(40000);
    expect(s.order).toEqual(["a"]);
    expect(s.treatments.a.items).toEqual([]);
    expect(s.plan).toBe("free");
  });
  it("los meses de ejemplo terminan en el mes actual", () => {
    const s = makeDemo(new Date(2026, 9, 23));
    expect(Object.keys(s.months).sort().at(-1)).toBe(mkey(new Date(2026, 9, 23)));
  });
  it("formatea pesos negativos con el signo correcto", () => {
    expect(money(-4687.5)).toBe("−$4,688");
    expect(money(-0.2)).toBe("$0");
  });
});

describe("plantillas por especialidad", () => {
  it("agrega sin repetir tratamientos y reutiliza materiales con el mismo nombre", async () => {
    const { applySpecialty, SPECIALTIES } = await import("../src/lib/templates");
    const st = makeDemo(), general = SPECIALTIES.find((s) => s.id === "general")!;
    const r = applySpecialty(st, general);
    // Resina y Extracción simple ya estaban en el ejemplo
    expect(r.added).toBe(general.list.length - 2);
    expect(r.state.order.length).toBe(st.order.length + r.added);
    expect(r.state.materials.filter((m) => m.name === "Anestesia (cartucho)").length).toBe(1);
    const inc = Object.values(r.state.treatments).find((t) => t.name === "Incrustación")!;
    expect(inc.lab).toBe(1500);
    for (const [id] of inc.items) expect(r.state.materials.some((m) => m.id === id)).toBe(true);
  });
  it("respeta el límite del plan Gratis y puede reemplazar los tratamientos", async () => {
    const { applySpecialty, SPECIALTIES } = await import("../src/lib/templates");
    const st = makeDemo(), ninos = SPECIALTIES.find((s) => s.id === "ninos")!;
    const full = applySpecialty(st, ninos, { limit: 6 });
    expect(full.added).toBe(0); expect(full.skipped).toBe(ninos.list.length);
    const only = applySpecialty(st, ninos, { replace: true, limit: 6 });
    expect(only.state.order.length).toBe(6);
    expect(Object.keys(only.state.treatments).length).toBe(6);
    // el mes se sigue calculando sin los tratamientos que se quitaron
    expect(monthPL(only.state, mkey()).ing).toBe(0);
  });
});
