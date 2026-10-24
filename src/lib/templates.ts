// Plantillas por especialidad: tratamientos típicos con minutos y materiales de referencia en México (MXN, 2026).
// Son un punto de partida: el dentista ajusta minutos, costos y precio a los suyos.
import { uid } from "./format";
import { T, type Item, type Material, type State, type Treatment } from "./model";

interface Mat { name: string; cost: number; packPrice?: number; packUses?: number }
const M: Record<string, Mat> = {
  kit: { name: "Kit desechable (guantes, cubrebocas, babero)", cost: 40 },
  anest: { name: "Anestesia (cartucho)", cost: 18, packPrice: 900, packUses: 50 },
  resina: { name: "Resina compuesta (por uso)", cost: 85, packPrice: 850, packUses: 10 },
  adhesivo: { name: "Adhesivo (por uso)", cost: 35, packPrice: 1400, packUses: 40 },
  pasta: { name: "Pasta profiláctica", cost: 15, packPrice: 300, packUses: 20 },
  fluor: { name: "Barniz de flúor", cost: 35 },
  sellador: { name: "Sellador de fosetas (por pieza)", cost: 30 },
  ionomero: { name: "Ionómero de vidrio (por uso)", cost: 40 },
  sutura: { name: "Sutura", cost: 45, packPrice: 540, packUses: 12 },
  limas: { name: "Limas rotatorias (por caso)", cost: 280, packPrice: 1680, packUses: 6 },
  guta: { name: "Gutapercha y cemento", cost: 60 },
  pulpar: { name: "Medicamento pulpar (MTA o formocresol)", cost: 90 },
  coronaAcero: { name: "Corona de acero (pediátrica)", cost: 120 },
  clorhex: { name: "Clorhexidina (por paciente)", cost: 15 },
  brackets: { name: "Brackets metálicos (juego)", cost: 900 },
  adhBrackets: { name: "Adhesivo para brackets", cost: 150 },
  arco: { name: "Arco de ortodoncia", cost: 60 },
  ligas: { name: "Ligas y módulos", cost: 20 },
  impresion: { name: "Material de impresión (por caso)", cost: 120 },
  cemento: { name: "Cemento definitivo", cost: 70 },
  provisional: { name: "Provisional de acrílico", cost: 60 },
  hilo: { name: "Hilo retractor", cost: 15 },
  implante: { name: "Implante (pieza)", cost: 5500 },
  pilar: { name: "Pilar o aditamento protésico", cost: 2500 },
  gel: { name: "Gel blanqueador (kit de consultorio)", cost: 1200 },
  barrera: { name: "Barrera gingival", cost: 80 },
};

type Tpl = [name: string, minutes: number, items: [keyof typeof M, number][], extra?: Partial<Treatment>];
export interface Specialty { id: string; name: string; desc: string; list: Tpl[] }

export const SPECIALTIES: Specialty[] = [
  { id: "general", name: "Odontología general", desc: "Valoración, limpieza, resinas y extracciones", list: [
    ["Consulta y valoración", 20, [["kit", 1]]],
    ["Limpieza dental", 45, [["kit", 1], ["pasta", 1]]],
    ["Resina", 60, [["resina", 1], ["adhesivo", 1], ["anest", 1], ["kit", 1]]],
    ["Extracción simple", 40, [["anest", 2], ["kit", 1], ["sutura", 1]]],
    ["Aplicación de flúor", 15, [["kit", 1], ["fluor", 1]]],
    ["Incrustación", 90, [["anest", 1], ["impresion", 1], ["cemento", 1], ["kit", 2]], { lab: 1500 }],
  ] },
  { id: "orto", name: "Ortodoncia", desc: "Brackets, ajustes mensuales y retenedores", list: [
    ["Valoración y estudios de ortodoncia", 40, [["kit", 1]], { other: 600 }],
    ["Colocación de brackets metálicos", 120, [["brackets", 1], ["adhBrackets", 1], ["kit", 1]]],
    ["Cita de ajuste mensual", 30, [["arco", 1], ["ligas", 1], ["kit", 1]]],
    ["Retiro de brackets y retenedores", 60, [["kit", 1], ["impresion", 1]], { lab: 900 }],
    ["Aparato de ortopedia removible", 45, [["kit", 1], ["impresion", 1]], { lab: 1800 }],
  ] },
  { id: "endo", name: "Endodoncia", desc: "Conductos anteriores, premolares, molares y retratamientos", list: [
    ["Endodoncia anterior", 60, [["anest", 1], ["kit", 1], ["limas", 1], ["guta", 1]]],
    ["Endodoncia premolar", 75, [["anest", 2], ["kit", 1], ["limas", 1], ["guta", 1]]],
    ["Endodoncia molar", 120, [["anest", 2], ["kit", 1], ["limas", 2], ["guta", 2]]],
    ["Retratamiento de conductos", 150, [["anest", 2], ["kit", 1], ["limas", 2], ["guta", 2]], { other: 100 }],
    ["Pulpotomía", 45, [["anest", 1], ["kit", 1], ["pulpar", 1], ["ionomero", 1]]],
  ] },
  { id: "ninos", name: "Odontopediatría", desc: "Profilaxis, selladores, pulpotomías y coronas de acero", list: [
    ["Consulta y profilaxis infantil", 30, [["kit", 1], ["pasta", 1], ["fluor", 1]]],
    ["Selladores (por pieza)", 20, [["sellador", 1], ["kit", 1]]],
    ["Resina infantil", 40, [["resina", 1], ["adhesivo", 1], ["anest", 1], ["kit", 1]]],
    ["Pulpotomía infantil", 45, [["anest", 1], ["pulpar", 1], ["ionomero", 1], ["kit", 1]]],
    ["Corona de acero", 45, [["coronaAcero", 1], ["ionomero", 1], ["anest", 1], ["kit", 1]]],
    ["Extracción infantil", 25, [["anest", 1], ["kit", 1]]],
  ] },
  { id: "perio", name: "Periodoncia", desc: "Raspado, cirugía y mantenimiento", list: [
    ["Valoración periodontal", 30, [["kit", 1]]],
    ["Raspado y alisado (por cuadrante)", 60, [["anest", 2], ["kit", 1], ["clorhex", 1]]],
    ["Cirugía periodontal (por cuadrante)", 120, [["anest", 3], ["sutura", 2], ["kit", 2]]],
    ["Mantenimiento periodontal", 45, [["kit", 1], ["pasta", 1], ["clorhex", 1]]],
  ] },
  { id: "protesis", name: "Prótesis e implantes", desc: "Coronas, prótesis totales e implantes", list: [
    ["Corona de zirconia", 90, [["anest", 1], ["impresion", 1], ["hilo", 1], ["provisional", 1], ["cemento", 1], ["kit", 2]], { lab: 2800 }],
    ["Corona metal-porcelana", 90, [["anest", 1], ["impresion", 1], ["hilo", 1], ["provisional", 1], ["cemento", 1], ["kit", 2]], { lab: 1800 }],
    ["Prótesis total (por arcada)", 180, [["impresion", 2], ["kit", 4]], { lab: 3500 }],
    ["Colocación de implante", 90, [["implante", 1], ["anest", 3], ["sutura", 1], ["kit", 2]], { other: 300 }],
    ["Corona sobre implante", 60, [["pilar", 1], ["impresion", 1], ["kit", 2]], { lab: 3000 }],
  ] },
  { id: "estetica", name: "Estética dental", desc: "Blanqueamiento y carillas", list: [
    ["Blanqueamiento en consultorio", 90, [["gel", 1], ["barrera", 1], ["kit", 1]]],
    ["Carilla de resina (por pieza)", 90, [["resina", 2], ["adhesivo", 1], ["kit", 1]]],
    ["Carilla de porcelana (por pieza)", 90, [["anest", 1], ["impresion", 1], ["cemento", 1], ["kit", 2]], { lab: 3500 }],
    ["Diseño de sonrisa (valoración)", 60, [["kit", 1]], { other: 300 }],
  ] },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Agrega (o con replace, pone en lugar de los actuales) los tratamientos de una especialidad.
 * Reutiliza los materiales que ya existan con el mismo nombre y no repite tratamientos.
 * limit: cuántos tratamientos puede haber en total (plan Gratis).
 */
export function applySpecialty(st: State, spec: Specialty, { replace = false, limit = Infinity } = {}) {
  const materials: Material[] = [...st.materials];
  const matId = (key: keyof typeof M) => {
    const m = M[key], found = materials.find((x) => same(x.name, m.name));
    if (found) return found.id;
    const id = uid("m");
    materials.push({ id, name: m.name, cost: m.cost, ...(m.packPrice ? { packPrice: m.packPrice, packUses: m.packUses } : {}) });
    return id;
  };
  const treatments: Record<string, Treatment> = replace ? {} : { ...st.treatments };
  const order = replace ? [] : [...st.order];
  let added = 0, skipped = 0;
  for (const [name, minutes, items, extra] of spec.list) {
    if (order.some((id) => same(treatments[id].name, name))) continue;
    if (order.length >= limit) { skipped++; continue; }
    const id = uid("t");
    treatments[id] = T(name, minutes, items.map(([k, q]) => [matId(k), q] as Item), extra);
    order.push(id); added++;
  }
  return { state: { ...st, materials, treatments, order }, added, skipped };
}
