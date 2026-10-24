import { mkey, mshift, type Numish } from "./format";
import type { PlanId } from "./plans";
import type { Regime } from "./tax";

export interface Logo { src: string; w: number; h: number }
export interface Clinic {
  name: string; doctor: string; city: string; phone: string; logo: Logo | null;
  rent: Numish; services: Numish; staff: Numish; software: Numish; ads: Numish; other: Numish;
  equipValue: Numish; equipYears: Numish; hoursDay: Numish; daysMonth: Numish; units: Numish; occupancy: Numish;
  ownerPay: Numish; cardShare: Numish; cardFee: Numish; target: Numish;
}
export interface Employee { id: string; role: string; salary: Numish; imss: boolean }
export interface Payroll { cargas: Numish; isn: Numish; list: Employee[] }
export interface Material { id: string; name: string; cost: Numish; packPrice?: Numish; packUses?: Numish }
export type Item = [string, Numish];
export interface Treatment {
  name: string; minutes: Numish; items: Item[]; lab: Numish; fees: Numish;
  feeMode: "fixed" | "pct"; feePct: Numish; other: Numish; price: Numish; market: Numish;
}
export interface Extra { id: string; name: string; amount: Numish }
export interface MonthRecord { counts: Record<string, Numish>; extras: Extra[] }
export interface QuoteItem { tid: string; name: string; qty: Numish; price: Numish }
export interface Quote {
  id: string; folio: string; patient: string; date: string; items: QuoteItem[];
  discount: Numish; payment: string; notes: string;
  /** WhatsApp del paciente, para abrir su chat con el presupuesto */
  phone?: string;
}
export interface State {
  v: 2;
  /** Plan elegido en la vista previa. En producción manda el servidor. */
  plan: PlanId;
  edited: boolean;
  clinic: Clinic;
  payroll: Payroll;
  materials: Material[];
  treatments: Record<string, Treatment>;
  order: string[];
  months: Record<string, MonthRecord>;
  tax: { regime: Regime; pmShare: Numish };
  goal: { net: Numish };
  msi: Record<string, Numish>;
  quotes: Quote[];
  updatedAt?: number;
}

export const KEY = "odontocostos.v2";
export const OLD_KEY = "odontocostos.v1";

export const T = (name: string, minutes: number, items: Item[], extra?: Partial<Treatment>): Treatment => ({
  name, minutes, items, lab: 0, fees: 0, feeMode: "fixed", feePct: 0, other: 0, price: "", market: "", ...(extra || {}),
});

export const DEMO_COUNTS: Record<string, number> = { limpieza: 30, resina: 34, extraccion: 12, endodoncia: 6, corona: 4, ortodoncia: 40 };

/** Consultorio de ejemplo (típico en México, MXN). Siempre se presenta como ejemplo. */
export function makeDemo(now = new Date()): State {
  const cur = mkey(now), months: Record<string, MonthRecord> = {};
  [0.82, 0.9, 0.97, 0.88, 1.04, 1].forEach((f, i) => {
    months[mshift(cur, i - 5)] = {
      counts: Object.fromEntries(Object.entries(DEMO_COUNTS).map(([id, n]) => [id, Math.round(n * f)])),
      extras: i === 3 ? [{ id: "e1", name: "Reparación del compresor", amount: 3200 }] : [],
    };
  });
  return {
    v: 2, plan: "free", edited: false,
    clinic: {
      name: "", doctor: "", city: "", phone: "", logo: null,
      rent: 12000, services: 3500, staff: 14000, software: 1500, ads: 4000, other: 2000,
      equipValue: 450000, equipYears: 8, hoursDay: 8, daysMonth: 22, units: 1, occupancy: 60,
      ownerPay: 40000, cardShare: 50, cardFee: 4.06, target: 30,
    },
    payroll: {
      cargas: 26, isn: 3,
      list: [
        { id: "p1", role: "Asistente dental", salary: 9000, imss: true },
        { id: "p2", role: "Recepción (medio tiempo)", salary: 5000, imss: false },
      ],
    },
    materials: [
      { id: "m1", name: "Resina compuesta (por uso)", cost: 85, packPrice: 850, packUses: 10 },
      { id: "m2", name: "Adhesivo (por uso)", cost: 35, packPrice: 1400, packUses: 40 },
      { id: "m3", name: "Anestesia (cartucho)", cost: 18, packPrice: 900, packUses: 50 },
      { id: "m4", name: "Kit desechable (guantes, cubrebocas, babero)", cost: 40 },
      { id: "m5", name: "Pasta profiláctica", cost: 15, packPrice: 300, packUses: 20 },
      { id: "m6", name: "Limas rotatorias (por caso)", cost: 280, packPrice: 1680, packUses: 6 },
      { id: "m7", name: "Gutapercha y cemento", cost: 60 },
      { id: "m8", name: "Sutura", cost: 45, packPrice: 540, packUses: 12 },
    ],
    treatments: {
      limpieza: T("Limpieza", 45, [["m4", 1], ["m5", 1]], { price: 700 }),
      resina: T("Resina", 60, [["m1", 1], ["m2", 1], ["m3", 1], ["m4", 1]], { price: 900 }),
      extraccion: T("Extracción simple", 40, [["m3", 2], ["m4", 1], ["m8", 1]], { price: 800 }),
      endodoncia: T("Endodoncia", 90, [["m3", 2], ["m4", 1], ["m6", 1], ["m7", 1]], { other: 50, price: 3500 }),
      corona: T("Corona", 90, [["m3", 1], ["m4", 2]], { lab: 1800, other: 100, price: 6000 }),
      ortodoncia: T("Ortodoncia (cita mensual)", 30, [["m4", 1]], { other: 120, price: 900 }),
    },
    order: ["limpieza", "resina", "extraccion", "endodoncia", "corona", "ortodoncia"],
    months,
    tax: { regime: "resico", pmShare: 0 },
    goal: { net: "" },
    msi: { 3: 5.5, 6: 8.5, 9: 11.5, 12: 14.5 },
    quotes: [],
  };
}

const PLAN_IDS: PlanId[] = ["free", "plus", "pro"];

/** Acepta datos de cualquier versión (respaldo, nube, v1) y rellena lo que falte. */
export function normalize(o: any): State {
  const d = makeDemo();
  const s: State = { ...d, ...o };
  s.clinic = { ...d.clinic, ...(o.clinic || {}) };
  s.payroll = { ...d.payroll, ...(o.payroll || {}) };
  if (!Array.isArray(s.payroll.list)) s.payroll.list = [];
  s.tax = { ...d.tax, ...(o.tax || {}) };
  s.goal = { ...d.goal, ...(o.goal || {}) };
  s.msi = { ...d.msi, ...(o.msi || {}) };
  s.months = o.months && typeof o.months === "object" ? o.months : {};
  s.quotes = Array.isArray(o.quotes) ? o.quotes : [];
  s.materials = Array.isArray(o.materials) ? o.materials : d.materials;
  s.treatments = Object.fromEntries(
    Object.entries((o.treatments || d.treatments) as Record<string, any>).map(([k, t]) => [
      k, { ...T("Tratamiento", 30, []), ...t, items: Array.isArray(t.items) ? t.items : [] },
    ]),
  );
  s.order = (Array.isArray(o.order) ? o.order : Object.keys(s.treatments)).filter((k: string) => s.treatments[k]);
  Object.keys(s.treatments).forEach((k) => { if (!s.order.includes(k)) s.order.push(k); });
  if (!PLAN_IDS.includes(s.plan)) s.plan = "free";
  s.edited = !!s.edited;
  s.v = 2;
  return s;
}

/** Lee lo guardado en este dispositivo. Migra la primera versión de la app. */
export function loadLocal(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); if (o && o.v === 2) return normalize(o); }
  } catch { /* sin almacenamiento */ }
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.treatments) return normalize({ ...o, edited: true, months: {}, order: Object.keys(o.treatments), payroll: { list: [] } });
    }
  } catch { /* sin almacenamiento */ }
  return makeDemo();
}
export function saveLocal(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin almacenamiento */ }
}
export const isValidBackup = (o: any) => !!(o && typeof o === "object" && o.clinic && o.treatments);
