/**
 * Impuestos de personas físicas en México, 2026 (estimación).
 * Tarifa mensual del art. 96 LISR publicada en el Anexo 8 de la RMF 2026 (DOF 28/12/2025):
 * [límite inferior, cuota fija, % sobre el excedente del límite inferior].
 */
export const ISR_2026: [number, number, number][] = [
  [0.01, 0, 1.92],
  [844.6, 16.22, 6.4],
  [7168.52, 420.95, 10.88],
  [12598.03, 1011.68, 16],
  [14644.65, 1339.14, 17.92],
  [17533.65, 1856.84, 21.36],
  [35362.84, 5665.16, 23.52],
  [55736.69, 10457.09, 30],
  [106410.51, 25659.23, 32],
  [141880.67, 37009.69, 34],
  [425642, 133488.54, 35],
];
/** RESICO personas físicas: tasa mensual sobre ingresos cobrados (art. 113-E LISR). */
export const RESICO: [number, number][] = [
  [25000, 1],
  [50000, 1.1],
  [83333.33, 1.5],
  [208333.33, 2],
  [Infinity, 2.5],
];
export const RESICO_ANNUAL_CAP = 3_500_000;

export function isrTarifa(base: number): number {
  if (!(base > 0)) return 0;
  let row = ISR_2026[0];
  for (const r of ISR_2026) if (base >= r[0]) row = r;
  return row[1] + ((base - row[0]) * row[2]) / 100;
}
export const resicoRate = (ing: number) => {
  for (const [lim, r] of RESICO) if (ing <= lim) return r;
  return 2.5;
};
export const resicoISR = (ing: number) => (ing > 0 ? (ing * resicoRate(ing)) / 100 : 0);

export type Regime = "resico" | "prof";
export const REGIME: Record<Regime, string> = { resico: "RESICO", prof: "Actividad profesional" };
