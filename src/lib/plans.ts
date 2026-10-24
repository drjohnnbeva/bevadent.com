export type PlanId = "free" | "plus" | "pro";
export type Interval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  rank: number;
  /** Precio con IVA incluido, en pesos */
  monthly: number;
  yearly: number;
  /** Precio de fundador por mes (primeros 100, de por vida) */
  founderMonthly: number;
  tag: string;
  feats: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "Gratis", rank: 0, monthly: 0, yearly: 0, founderMonthly: 0,
    tag: "Tu costo por hora y el precio de tus tratamientos.",
    feats: [
      "Costo por hora de tu consultorio",
      "Hasta 6 tratamientos con sus materiales",
      "Precio mínimo y precio recomendado",
      "Prueba precios y ve si ganas o pierdes",
      "3 lecciones para aprender a cobrar",
    ],
  },
  plus: {
    id: "plus", name: "Plus", rank: 1, monthly: 99, yearly: 990, founderMonthly: 49,
    tag: "Te explica cada peso de tu precio.",
    feats: [
      "Todo lo de Gratis",
      "Reposición de equipo, varios sillones y comisión de la terminal",
      "Tratamientos sin límite y materiales por presentación",
      "¿Por qué cobrar eso? Tu precio, peso por peso",
      "Compara tu precio con el de tu ciudad",
      "Lista de precios en PDF con tu logo",
      "Simulador de promociones y meses sin intereses",
      "Todas las lecciones",
    ],
  },
  pro: {
    id: "pro", name: "Pro", rank: 2, monthly: 199, yearly: 1990, founderMonthly: 99,
    tag: "Como tener a tu contador en el bolsillo.",
    feats: [
      "Todo lo de Plus",
      "Estado de resultados de cada mes",
      "Cuánto te queda libre después de gastos e impuestos",
      "ISR estimado en RESICO y en actividad profesional",
      "Punto de equilibrio y metas de ingreso",
      "Ganancia por hora de cada tratamiento y escenarios",
      "Costo real de tu personal: IMSS, aguinaldo y nómina",
      "Presupuestos para pacientes en PDF",
      "Reporte mensual en PDF",
    ],
  },
};
export const PLAN_ORDER: PlanId[] = ["free", "plus", "pro"];
export const FREE_TREATS = 6;
/** Días de prueba de Plus y Pro con tarjeta (el servidor manda el valor real en /api/config) */
export const TRIAL_DAYS = 7;

export const can = (plan: PlanId, need: PlanId) => (PLANS[plan] || PLANS.free).rank >= PLANS[need].rank;
