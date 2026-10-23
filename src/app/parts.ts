import type { PL } from "../lib/calc";
import type { Part } from "../ui/kit";

/** A dónde se va cada peso cobrado en el mes. Colores categóricos validados para daltonismo. */
export const parts100 = (pl: PL): Part[] => [
  { label: "Te queda libre", value: Math.max(0, pl.net), color: "var(--s1)" },
  { label: "Materiales, laboratorio y comisiones", value: pl.card + pl.direct, color: "var(--s2)" },
  { label: "Gastos fijos del consultorio", value: pl.fixed + pl.extras, color: "var(--s3)" },
  { label: "Reserva para reponer equipo", value: pl.reserve, color: "var(--s4)" },
  { label: "Impuestos (ISR)", value: pl.isr, color: "var(--s5)" },
];
