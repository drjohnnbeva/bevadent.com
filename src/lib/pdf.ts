import type { jsPDF as JsPDF } from "jspdf";
import { monthPL, quoteCalc } from "./calc";
import { N, fmtDate, mlabel, pm } from "./format";
import type { Quote, State } from "./model";
import { REGIME } from "./tax";

type RGB = [number, number, number];
const INK: RGB = [18, 33, 29], GREY: RGB = [75, 92, 86], GREEN: RGB = [11, 122, 97], ZEBRA: RGB = [238, 243, 240], RULE: RGB = [221, 229, 224];

async function newDoc(): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "pt", format: "letter" });
}
function header(doc: JsPDF, st: State, title: string, right?: string) {
  const c = st.clinic, y = 48;
  let x = 48;
  if (c.logo && c.logo.src) {
    const hh = 56, w = Math.min(150, (hh * c.logo.w) / c.logo.h);
    try { doc.addImage(c.logo.src, "PNG", x, y, w, hh); x += w + 16; } catch { /* logo inválido */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
  doc.text(c.name || "Consultorio dental", x, y + 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
  const line = [c.doctor, c.city, c.phone].filter(Boolean).join("     ");
  if (line) doc.text(line, x, y + 40);
  let yy = y + 78;
  doc.setDrawColor(...RULE); doc.line(48, yy, 564, yy); yy += 30;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...GREEN); doc.text(title, 48, yy);
  if (right) { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY); doc.text(right, 564, yy, { align: "right" }); }
  return yy + 28;
}
function footer(doc: JsPDF, left: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 163, 157);
    if (left) doc.text(left, 48, 764);
    doc.text("Hecho con OdontoCostos", 564, 764, { align: "right" });
  }
}
function row(doc: JsPDF, y: number, i: number, left: string, right: string, bold?: boolean) {
  if (i % 2 === 0) { doc.setFillColor(...ZEBRA); doc.rect(48, y - 17, 516, 26, "F"); }
  doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(left, 380)[0], 60, y);
  doc.setFont("helvetica", "bold"); doc.text(right, 552, y, { align: "right" });
}

export async function pdfPriceList(st: State): Promise<Blob> {
  const doc = await newDoc();
  let y = header(doc, st, "Lista de precios", fmtDate(new Date()));
  st.order.forEach((id, i) => {
    const t = st.treatments[id];
    if (y > 720) { doc.addPage(); y = 64; }
    row(doc, y, i, t.name, N(t.price) > 0 ? pm(N(t.price)) : "Consultar"); y += 26;
  });
  y += 14; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text("Precios en pesos mexicanos. El precio final se confirma después de la valoración clínica.", 48, y);
  footer(doc, st.clinic.name);
  return doc.output("blob");
}

export async function pdfQuote(st: State, q: Quote): Promise<Blob> {
  const doc = await newDoc(), qc = quoteCalc(st, q);
  let y = header(doc, st, "Presupuesto", q.folio + "     " + fmtDate(q.date));
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text("Paciente: " + (q.patient || "________________"), 48, y); y += 26;
  doc.setFillColor(...INK); doc.rect(48, y - 15, 516, 22, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(9);
  doc.text("Tratamiento", 60, y); doc.text("Cant.", 370, y, { align: "right" }); doc.text("Precio", 460, y, { align: "right" }); doc.text("Importe", 552, y, { align: "right" });
  y += 26;
  qc.lines.forEach((l, i) => {
    if (y > 700) { doc.addPage(); y = 64; }
    if (i % 2 === 1) { doc.setFillColor(...ZEBRA); doc.rect(48, y - 17, 516, 26, "F"); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(l.name, 280)[0], 60, y);
    doc.text(String(N(l.qty)), 370, y, { align: "right" }); doc.text(pm(N(l.price)), 460, y, { align: "right" }); doc.text(pm(l.imp), 552, y, { align: "right" });
    y += 26;
  });
  y += 6; doc.setDrawColor(...RULE); doc.line(340, y, 564, y); y += 20;
  const tot = (a: string, b: string, bold?: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 13 : 11); doc.setTextColor(...INK);
    doc.text(a, 460, y, { align: "right" }); doc.text(b, 552, y, { align: "right" }); y += bold ? 24 : 20;
  };
  tot("Subtotal", pm(qc.sub));
  if (qc.disc > 0) tot("Descuento " + Math.round(qc.d * 100) + "%", "-" + pm(qc.disc));
  tot("Total", pm(qc.total), true);
  y += 8; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(qc.months ? "Forma de pago: hasta " + qc.months + " meses sin intereses de " + pm(qc.monthly) + " con tarjeta participante." : "Forma de pago: de contado.", 48, y); y += 16;
  doc.setTextColor(...GREY); doc.text("Vigencia: 30 días a partir de la fecha. Sujeto a cambios según la valoración clínica.", 48, y); y += 22;
  if (q.notes) { doc.setTextColor(...INK); const lines = doc.splitTextToSize("Notas: " + q.notes, 516); doc.text(lines, 48, y); y += lines.length * 14 + 8; }
  y = Math.max(y + 40, 640); doc.setDrawColor(...GREY); doc.line(60, y, 260, y); doc.line(352, y, 552, y);
  doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text("Firma del paciente", 160, y + 14, { align: "center" }); doc.text("Firma del dentista", 452, y + 14, { align: "center" });
  footer(doc, st.clinic.name);
  return doc.output("blob");
}

export async function pdfMonth(st: State, key: string): Promise<Blob> {
  const doc = await newDoc(), pl = monthPL(st, key);
  let y = header(doc, st, "Estado de resultados", mlabel(key));
  const L: [string, number, boolean?][] = [
    ["Ingresos cobrados", pl.ing, true], ["Comisiones de la terminal", -pl.card], ["Materiales, laboratorio y especialistas", -pl.direct],
    ["Utilidad bruta", pl.gross, true], ["Gastos fijos del consultorio", -pl.fixed], ["Gastos extra del mes", -pl.extras],
    ["Utilidad de operación", pl.op, true], ["Reserva para reponer equipo", -pl.reserve],
    ["ISR estimado (" + REGIME[st.tax.regime] + ")", -pl.isr], ["Te queda libre", pl.net, true],
  ];
  L.filter((x) => x[2] || Math.abs(x[1]) >= 0.5).forEach(([a, b, bold], i) => { row(doc, y, i, (bold ? "" : "     ") + a, pm(b), !!bold); y += 26; });
  y += 12; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text("Tratamientos realizados: " + pl.count + "     Horas de sillón: " + Math.round(pl.hours) + "     Tu sueldo meta: " + pm(pl.salary), 48, y); y += 16;
  if (pl.ing > 0) { doc.text("De cada $100 que cobraste, te quedaron $" + Math.max(0, Math.round((pl.net / pl.ing) * 100)) + ".", 48, y); y += 16; }
  y += 8; doc.setTextColor(...GREY); doc.setFontSize(9);
  doc.text(doc.splitTextToSize("Estimación con la tarifa de ISR 2026 y los datos capturados en OdontoCostos. No sustituye la declaración que prepara tu contador.", 516), 48, y);
  footer(doc, st.clinic.name);
  return doc.output("blob");
}

export function priceText(st: State) {
  const lines = st.order.map((id) => { const t = st.treatments[id]; return "• " + t.name + ": " + (N(t.price) > 0 ? pm(N(t.price)) : "consultar"); });
  return "*" + (st.clinic.name || "Lista de precios") + "*\n" + (st.clinic.name ? "Lista de precios\n" : "") + "\n" + lines.join("\n") +
    "\n\nPrecios en pesos mexicanos. El precio final se confirma en tu valoración." + (st.clinic.phone ? "\nCitas: " + st.clinic.phone : "");
}
export function quoteText(st: State, q: Quote) {
  const qc = quoteCalc(st, q);
  return "*Presupuesto " + q.folio + "*" + (st.clinic.name ? ", " + st.clinic.name : "") + "\nPaciente: " + (q.patient || "—") + "\nFecha: " + fmtDate(q.date) + "\n\n" +
    qc.lines.map((l) => "• " + l.name + (N(l.qty) > 1 ? " ×" + N(l.qty) : "") + ": " + pm(l.imp)).join("\n") +
    (qc.disc > 0 ? "\n\nSubtotal: " + pm(qc.sub) + "\nDescuento: -" + pm(qc.disc) : "") + "\n*Total: " + pm(qc.total) + "*" +
    (qc.months ? "\nHasta " + qc.months + " meses sin intereses de " + pm(qc.monthly) : "") + "\n\nVigencia: 30 días.";
}
