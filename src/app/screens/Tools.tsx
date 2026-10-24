import { InstallCard, TextSizePicker } from "./Comfort";
import { useState, type ReactNode } from "react";
import { clinicCalc, effClinic, outcome, priceOf, quoteCalc, statusOf, treatCalc } from "../../lib/calc";
import { readLogo, saveFile } from "../../lib/files";
import { N, fmtDate, money, round50, slug, today, uid } from "../../lib/format";
import { isValidBackup, makeDemo, normalize, type Quote, type State } from "../../lib/model";
import { pdfPriceList, pdfQuote, priceText, quoteText } from "../../lib/pdf";
import { can, type PlanId } from "../../lib/plans";
import { Back, Chips, cleanNum, Confirm, CopyBtn, FileBtn, I, KV, Locked, Num, Pill, Stepper, Tag, Title, Txt } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

export const TOOLS: { path: string; label: string; short: string; desc: string; need: PlanId | null; Icon: () => ReactNode }[] = [
  { path: PATH.prices, label: "Lista de precios", short: "Lista de precios", desc: "PDF con tu logo y texto para WhatsApp", need: "plus", Icon: I.list },
  { path: PATH.promos, label: "Promociones y meses sin intereses", short: "Promociones y MSI", desc: "¿Esta promoción me deja ganancia?", need: "plus", Icon: I.percent },
  { path: PATH.quotes, label: "Presupuestos para pacientes", short: "Presupuestos", desc: "Total, descuento y mensualidades en PDF", need: "pro", Icon: I.clip },
  { path: PATH.learn, label: "Aprende a cobrar", short: "Aprende a cobrar", desc: "Lecciones de un minuto", need: null, Icon: I.learn },
  { path: PATH.profile, label: "Datos de tu consultorio", short: "Mi consultorio", desc: "Nombre, logo y teléfono para tus PDF", need: null, Icon: I.clinic },
  { path: PATH.backup, label: "Respaldo de tus datos", short: "Respaldo", desc: "Guarda una copia o pásala a otro dispositivo", need: null, Icon: I.save },
  { path: PATH.account, label: "Tu cuenta y tu plan", short: "Cuenta", desc: "Entrar, suscripción y factura", need: null, Icon: I.user },
];

export function More() {
  const { st, go, wide } = useApp();
  return (
    <div className="screen">
      <Title title="Herramientas" lead="Lo que usas para cobrar, compartir y cuidar tus datos." />
      {!wide && <TextSizePicker />}
      {wide ? (
        <div className="g3">
          {TOOLS.map(({ path, label, desc, need, Icon }) => (
            <button className="tool" key={path} onClick={() => go(path)}>
              <span className="lk"><Icon /></span>
              <span className="row between nw full"><b className="wrap">{label}</b>{need && !can(st.plan, need) && <Tag p={need} />}</span>
              <span className="muted small">{desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <section className="panel">
          <div className="rows">
            {TOOLS.map(({ path, label, desc, need }) => (
              <button className="lrow" key={path} onClick={() => go(path)}>
                <span className="main"><span className="name">{label}</span><span className="muted small">{desc}</span></span>
                {need && !can(st.plan, need) && <Tag p={need} />}<I.chev />
              </button>
            ))}
          </div>
        </section>
      )}
      <InstallCard />
      {wide && <TextSizePicker />}
    </div>
  );
}

/** Encabezado de las herramientas: en el teléfono lleva botón para volver a Más. */
function ToolHead({ title, lead }: { title: string; lead?: string }) {
  const { wide } = useApp();
  return <>{!wide && <Back to={PATH.more} label="Más" />}<Title title={title} lead={lead} /></>;
}

export function PriceList() {
  const { st, set, go, wide } = useApp();
  if (!can(st.plan, "plus")) return (
    <div className="screen"><ToolHead title="Tu lista de precios, lista para compartir" />
      <Locked need="plus" title="Lista de precios con tu logo">Arma tu lista con tus precios y descárgala en PDF con el logo de tu consultorio, o cópiala para WhatsApp.</Locked></div>
  );
  const cc = clinicCalc(effClinic(st));
  const ut = (id: string, price: string) => set((s) => ({ ...s, treatments: { ...s.treatments, [id]: { ...s.treatments[id], price } } }));
  const empty = st.order.filter((id) => !(N(st.treatments[id].price) > 0)).length;
  const fill = () => set((s) => ({ ...s, treatments: Object.fromEntries(Object.entries(s.treatments).map(([k, t]) => (N(t.price) > 0 ? [k, t] : [k, { ...t, price: round50(treatCalc(t, s.materials, cc, s.clinic.target).recPrice) }]))) }));
  const rows = st.order.map((id) => { const t = st.treatments[id]; return { id, t, r: treatCalc(t, st.materials, cc, st.clinic.target) }; });
  const input = (x: (typeof rows)[number]) => <div className="inp"><span className="affix">$</span><input aria-label={"Precio de " + x.t.name} type="text" inputMode="decimal" value={(x.t.price as any) ?? ""} onChange={(e) => ut(x.id, cleanNum(e.target.value))} /></div>;
  const fillBtn = empty > 0 && <button className="btn ghost sm start" onClick={fill}>Llenar {empty} {empty > 1 ? "vacíos" : "vacío"} con el recomendado</button>;
  const hint = !st.clinic.name && (
    <div className="note stack"><span>Agrega el nombre y el logo de tu consultorio para que salgan en el PDF.</span><button className="btn sm start" onClick={() => go(PATH.profile)}>Agregar datos</button></div>
  );
  return (
    <div className="screen">
      <ToolHead title="Tu lista de precios" lead="Lo que cobras hoy, comparado con lo que te recomendamos. Compártela en PDF o por WhatsApp." />
      <div className="cols l">
        <div className="col">
          {!wide && hint}
          <section className="panel">
            {wide ? (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Tratamiento</th><th className="r">Te cuesta</th><th className="r">Recomendado</th><th>Tu precio</th><th>Estado</th></tr></thead>
                <tbody>{rows.map((x) => <tr key={x.id}><td><b>{x.t.name}</b></td><td className="r num">{money(x.r.cost)}</td><td className="r num">{money(x.r.recPrice)}</td><td style={{ minWidth: 140 }}>{input(x)}</td><td><Pill s={statusOf(N(x.t.price), x.r, st.clinic.target)} /></td></tr>)}</tbody>
              </table></div>
            ) : rows.map((x) => (
              <div className="stack divided" key={x.id}>
                <div className="row between nowrap"><b className="wrap">{x.t.name}</b><Pill s={statusOf(N(x.t.price), x.r, st.clinic.target)} /></div>
                <div className="row nowrap"><div className="grow">{input(x)}</div><span className="muted small nowrap">Recomendado <span className="num">{money(x.r.recPrice)}</span></span></div>
              </div>
            ))}
            {fillBtn}
          </section>
        </div>
        <div className="col">
          {wide && hint}
          <FileBtn label="Descargar PDF con tu logo" name={slug(st.clinic.name) + "-lista-de-precios.pdf"} make={() => pdfPriceList(st)} />
          <CopyBtn text={priceText(st)} label="Copiar para WhatsApp" />
        </div>
      </div>
    </div>
  );
}

export function Promos() {
  const { st, set } = useApp();
  const [tid, setTid] = useState(st.order[0]), [disc, setDisc] = useState(15), [mo, setMo] = useState("3");
  if (!can(st.plan, "plus")) return (
    <div className="screen"><ToolHead title="¿Esta promoción me deja ganancia?" />
      <Locked need="plus" title="Simulador de promociones y MSI">Antes de lanzar un descuento o meses sin intereses, mira cuánto te cuesta y cuántos pacientes más necesitas.</Locked></div>
  );
  const id = st.treatments[tid] ? tid : st.order[0], t = st.treatments[id];
  if (!t) return <div className="screen"><ToolHead title="¿Esta promoción me deja ganancia?" /><p className="muted">Agrega un tratamiento primero.</p></div>;
  const cc = clinicCalc(effClinic(st)), r = treatCalc(t, st.materials, cc, st.clinic.target), p0 = priceOf(t, r), p1 = p0 * (1 - disc / 100), o0 = outcome(p0, r), o1 = outcome(p1, r);
  const rate = N(st.msi[mo]) / 100, profitMsi = p0 * (1 - r.pctFee - rate) - r.cost, minMsi = 1 - r.pctFee - rate > 0 ? r.cost / (1 - r.pctFee - rate) : NaN;
  return (
    <div className="screen">
      <ToolHead title="¿Esta promoción me deja ganancia?" lead="El descuento y los meses sin intereses salen de tu ganancia, no de tu costo. Mira cuánto antes de anunciarlos." />
      <Chips label="Tratamiento" value={id} onChange={setTid} options={st.order.map((k) => [k, st.treatments[k].name.split(" (")[0]])} />
      <div className="cols">
        <section className="panel">
          <h3>Descuento</h3>
          <div className="field"><label htmlFor="pdisc">Descuento: <span className="num">{disc}%</span></label><input id="pdisc" type="range" min="0" max="50" value={disc} onChange={(e) => setDisc(+e.target.value)} /></div>
          <div><KV label="Precio normal" value={p0} /><KV label="Con descuento" value={p1} /><KV label="Ganancia normal" value={o0.profit} /><KV cls="tot" label="Ganancia con la promoción" value={o1.profit} /></div>
          {o1.profit < 0 ? <div className="note bad">Con {disc}% de descuento pierdes {money(-o1.profit)} en cada paciente. Esta promoción no se paga sola.</div>
            : o0.profit > 0 && disc > 0 ? <div className="note">Para ganar lo mismo necesitas <b>{(o0.profit / o1.profit).toFixed(1)} veces</b> más pacientes de {t.name.toLowerCase()}.</div> : null}
        </section>
        <section className="panel">
          <h3>Meses sin intereses</h3>
          <Chips label="Plazo" value={mo} onChange={setMo} options={[["3", "3 meses"], ["6", "6 meses"], ["9", "9 meses"], ["12", "12 meses"]]} />
          <Num id={"msi" + mo} prefix="" suffix="%" label={"Lo que te cobra tu terminal por " + mo + " meses"} hint="Ya con la comisión normal e IVA. Revisa la tabla de tu banco o terminal." value={st.msi[mo]} onChange={(v) => set((s) => ({ ...s, msi: { ...s.msi, [mo]: v } }))} />
          <div><KV label="Cobras" value={p0} /><KV cls="ind" label="Se queda la terminal" value={p0 * rate} neg /><KV cls="tot" label="Tu ganancia" value={profitMsi} /></div>
          <div className={"note " + (profitMsi < 0 ? "bad" : p0 < minMsi * 1.1 ? "" : "good")}>{profitMsi < 0 ? "Con " + mo + " meses pierdes " + money(-profitMsi) + ". Ofrécelos solo desde " + money(minMsi) + "." : "Para ofrecer " + mo + " meses sin perder, cobra al menos " + money(minMsi) + "."}</div>
        </section>
      </div>
    </div>
  );
}

export function Quotes() {
  const { st, set } = useApp();
  const [edit, setEdit] = useState<string | null>(null);
  if (!can(st.plan, "pro")) return (
    <div className="screen"><ToolHead title="Presupuestos para tus pacientes" />
      <Locked need="pro" title="Presupuestos en PDF">Arma presupuestos con tus precios, descuentos y meses sin intereses. Tu paciente recibe un PDF claro y tú ves cuánto ganas.</Locked></div>
  );
  const q = st.quotes.find((x) => x.id === edit);
  if (q) return <QuoteEditor q={q} close={() => setEdit(null)} />;
  const add = () => {
    const n = st.quotes.length + 1;
    const nq: Quote = { id: uid("q"), folio: "P-" + String(n).padStart(4, "0"), patient: "", date: today(), items: [], discount: 0, payment: "contado", notes: "" };
    set((s) => ({ ...s, quotes: [nq, ...s.quotes] }));
    setEdit(nq.id);
  };
  return (
    <div className="screen">
      <ToolHead title="Presupuestos para tus pacientes" lead="Con tus precios, descuento y meses sin intereses. Solo tú ves cuánto ganas en cada uno." />
      <button className="btn auto" onClick={add}><I.plus />Nuevo presupuesto</button>
      {st.quotes.length > 0 ? (
        <section className="panel narrow"><div className="rows">
          {st.quotes.map((x) => (
            <button className="lrow" key={x.id} onClick={() => setEdit(x.id)}>
              <span className="main"><span className="name">{x.patient || "Paciente sin nombre"}</span><span className="muted small">{x.folio}, {fmtDate(x.date)}</span></span>
              <span className="num strong">{money(quoteCalc(st, x).total)}</span><I.chev />
            </button>
          ))}
        </div></section>
      ) : <p className="muted">Aún no tienes presupuestos.</p>}
    </div>
  );
}

function QuoteEditor({ q, close }: { q: Quote; close: () => void }) {
  const { st, set } = useApp();
  const cc = clinicCalc(effClinic(st)), qc = quoteCalc(st, q);
  const uq = (patch: Partial<Quote>) => set((s) => ({ ...s, quotes: s.quotes.map((x) => (x.id === q.id ? { ...x, ...patch } : x)) }));
  const ui = (i: number, patch: object) => uq({ items: q.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const addItem = (tid: string) => { const t = st.treatments[tid]; if (!t) return; uq({ items: [...q.items, { tid, name: t.name, qty: 1, price: priceOf(t, treatCalc(t, st.materials, cc, st.clinic.target)) }] }); };
  return (
    <div className="screen">
      <button className="btn quiet sm back" onClick={close}><I.back />Presupuestos</button>
      <Title title={"Presupuesto " + q.folio} />
      <div className="cols l">
        <div className="col">
          <section className="panel"><div className="row">
            <Txt id="qpat" label="Paciente" value={q.patient} onChange={(v) => uq({ patient: v })} />
            <div className="field w170"><label htmlFor="qdate">Fecha</label><div className="inp"><input id="qdate" className="txt" type="date" value={q.date} onChange={(e) => uq({ date: e.target.value })} /></div></div>
          </div></section>
          <section className="panel">
            <h3>Tratamientos</h3>
            {q.items.map((it, i) => (
              <div className="stack divided" key={i}>
                <div className="row between nowrap"><b className="wrap">{st.treatments[it.tid] ? st.treatments[it.tid].name : it.name}</b><button className="btn ghost icon" aria-label="Quitar" onClick={() => uq({ items: q.items.filter((_, j) => j !== i) })}><I.x /></button></div>
                <div className="row"><Stepper label="piezas" value={it.qty} onChange={(v) => ui(i, { qty: v })} /><div className="inp grow"><span className="affix">$</span><input aria-label="Precio" type="text" inputMode="decimal" value={it.price as any} onChange={(e) => ui(i, { price: cleanNum(e.target.value) })} /></div></div>
              </div>
            ))}
            <div className="field"><label htmlFor="qadd">Agregar tratamiento</label><div className="inp"><select id="qadd" value="" onChange={(e) => { addItem(e.target.value); e.target.value = ""; }}>
              <option value="">Elegir…</option>{st.order.map((id) => <option key={id} value={id}>{st.treatments[id].name}</option>)}
            </select></div></div>
          </section>
          <section className="panel">
            <h3>Descuento y forma de pago</h3>
            <Num id="qdisc" prefix="" suffix="%" label="Descuento" value={q.discount} onChange={(v) => uq({ discount: v })} />
            <Chips label="Forma de pago" value={q.payment} onChange={(v) => uq({ payment: v })} options={[["contado", "Contado"], ["3", "3 MSI"], ["6", "6 MSI"], ["9", "9 MSI"], ["12", "12 MSI"]]} />
            <div className="field"><label htmlFor="qnotes">Notas para el paciente</label><textarea id="qnotes" className="area" value={q.notes} onChange={(e) => uq({ notes: e.target.value })} placeholder="Ej. Incluye radiografía y una revisión." /></div>
          </section>
        </div>
        <div className="col sticky">
          <section className="panel">
            <KV label="Subtotal" value={qc.sub} />
            {qc.disc > 0 && <KV label={"Descuento " + Math.round(qc.d * 100) + "%"} value={qc.disc} neg />}
            <KV cls="grand" label="Total" value={qc.total} />
            {qc.months > 0 && <p className="small">{qc.months} pagos de <b className="num">{money(qc.monthly)}</b></p>}
            <div className={"note " + (qc.profit < 0 ? "bad" : "plain")}>Solo lo ves tú: con este presupuesto {qc.profit < 0 ? "pierdes " + money(-qc.profit) : "ganas " + money(qc.profit)} aparte de tu sueldo{qc.months ? ", ya con la comisión de " + qc.months + " meses sin intereses" : ""}.</div>
          </section>
          {q.items.length > 0 && <><FileBtn label="Descargar PDF para el paciente" name={slug(st.clinic.name) + "-presupuesto-" + q.folio + ".pdf"} make={() => pdfQuote(st, q)} /><CopyBtn text={quoteText(st, q)} label="Copiar para WhatsApp" /></>}
          <Confirm label="Eliminar presupuesto" ask="¿Eliminar este presupuesto?" yes="Sí, eliminar" onYes={() => { set((s) => ({ ...s, quotes: s.quotes.filter((x) => x.id !== q.id) })); close(); }} />
        </div>
      </div>
    </div>
  );
}

export function Learn() {
  const { st, go } = useApp();
  const [open, setOpen] = useState(0), [disc, setDisc] = useState(15), [mult, setMult] = useState(3);
  const cc = clinicCalc(effClinic(st)), demoT = st.order.map((id) => st.treatments[id]).sort((a, b) => N(b.minutes) - N(a.minutes))[0];
  const L: [PlanId, string, ReactNode][] = [
    ["free", "¿Qué es un costo fijo?", <p>Es lo que pagas <b>aunque no llegue ningún paciente</b>: renta, sueldo de tu asistente, internet. Si cierras una semana de vacaciones, igual se paga.</p>],
    ["free", "¿Qué es un costo variable?", <p>Es lo que gastas <b>solo cuando atiendes</b>: la resina, la anestesia, los guantes, el laboratorio de una corona. Sin paciente, no hay gasto.</p>],
    ["free", "¿Cuánto cuesta una hora de mi consultorio?", <p>Suma todos tus gastos fijos del mes, incluido tu sueldo, y divídelos entre las horas que <b>de verdad</b> atiendes. Si gastas $90,000 y atiendes 100 horas, cada hora cuesta $900. Si solo atiendes 50, cuesta $1,800. Por eso una agenda vacía encarece cada tratamiento.</p>],
    ["plus", "¿Qué diferencia hay entre sueldo y utilidad?", <p>El <b>sueldo</b> es el pago por tu trabajo, como si contrataras a otro dentista. La <b>utilidad</b> es lo que gana el consultorio como negocio, después de pagarte. Si solo te quedas con lo que sobra, no sabes si tu consultorio es rentable o si estás trabajando gratis.</p>],
    ["plus", "¿Qué es el margen de ganancia?", <p>Es qué parte del precio es ganancia. Una resina de $1,000 con costo de $700 deja $300: margen de <b>30%</b>. Pero el recargo sobre el costo es $300 ÷ $700 = <b>43%</b>. Para lograr 30% de margen, la fórmula es: precio = costo ÷ (1 − 0.30).</p>],
    ["plus", "¿Por qué multiplicar materiales por 3 no funciona?", demoT ? (
      <>
        <p>Porque los materiales son solo una parte. Un tratamiento largo usa pocos materiales y mucho tiempo de sillón. Prueba con tu {demoT.name.toLowerCase()}:</p>
        <div className="field"><label htmlFor="lmx">Multiplicar materiales por <span className="num">{mult}</span></label><input id="lmx" type="range" min="2" max="6" value={mult} onChange={(e) => setMult(+e.target.value)} /></div>
        {(() => { const r = treatCalc(demoT, st.materials, cc, st.clinic.target), p = r.direct * mult; return <><KV label={"Precio de materiales por " + mult} value={p} /><KV label="Costo real" value={r.cost} /><KV cls="tot" label="Resultado" value={outcome(p, r).profit} /></>; })()}
      </>
    ) : <p>Agrega un tratamiento para probar.</p>],
    ["plus", "¿Qué pasa cuando aplico descuentos?", (
      <>
        <p>El descuento sale <b>completo de tu ganancia</b>, no del costo.</p>
        <div className="field"><label htmlFor="ldx">Descuento: <span className="num">{disc}%</span></label><input id="ldx" type="range" min="0" max="40" value={disc} onChange={(e) => setDisc(+e.target.value)} /></div>
        {(() => { const g0 = 300, g1 = 1000 * (1 - disc / 100) - 700; return <><p className="muted small">Resina de $1,000 que te cuesta $700:</p><KV label="Ganancia sin descuento" value={g0} /><KV label={"Ganancia con " + disc + "%"} value={g1} /><p className="muted small">Para ganar lo mismo necesitarías {g1 > 0 ? (g0 / g1).toFixed(1) + " veces más pacientes" : "una cantidad imposible de pacientes"}.</p></>; })()}
      </>
    )],
    ["plus", "¿Cómo se calcula la comisión de la terminal?", <p>La terminal cobra su porcentaje sobre el <b>precio</b>, no sobre tu costo, y además cobra IVA sobre su comisión. Si cobras $1,000 con 3.5% más IVA, te quitan $40.60. Por eso el precio mínimo es costo ÷ (1 − comisión), y no costo + 3.5%.</p>],
    ["pro", "¿Por qué no recupero el IVA de mis materiales?", <p>Como cirujano dentista persona física, tus servicios están exentos de IVA. Suena bien, pero tiene truco: el IVA que pagas en resinas, guantes, laboratorio o renta <b>no lo puedes acreditar</b>. Ese 16% es costo tuyo. Por eso aquí anotas todo con IVA incluido.</p>],
    ["pro", "¿RESICO o actividad profesional?", <p>En <b>RESICO</b> pagas una tasa baja, de 1% a 2.5%, sobre todo lo que cobras, sin restar gastos. En <b>actividad profesional</b> pagas con la tarifa normal, hasta 35%, pero sobre tu utilidad: lo que cobras menos tus gastos con factura. Si tus gastos son bajos frente a tus ingresos, RESICO suele convenir. En Finanzas, Impuestos, ves los dos con tus números.</p>],
    ["pro", "¿Cuánto me cuesta de verdad mi asistente?", <p>Si le pagas $9,000 al mes, te cuesta más: aguinaldo (15 días al año), prima vacacional (25% de 12 días), cuotas del IMSS e INFONAVIT y el impuesto estatal sobre nómina. En total, unos $12,000 al mes. Ese es el número que va en tus gastos.</p>],
    ["pro", "¿Qué es el punto de equilibrio?", <p>Es lo mínimo que necesitas cobrar al mes para no perder: cubre gastos fijos, materiales, comisiones e impuestos, pero todavía no te paga a ti. Arriba de ese punto, cada peso extra deja ganancia.</p>],
  ];
  return (
    <div className="screen">
      <ToolHead title="Lecciones de un minuto" lead="Lo que nadie te enseñó en la carrera sobre cobrar." />
      <section className="panel narrow lessons">
        {L.map(([need, q, body], i) => {
          const ok = can(st.plan, need);
          return (
            <div className="lesson" key={i}>
              <button className="q" aria-expanded={ok && open === i} onClick={() => (ok ? setOpen(open === i ? -1 : i) : go(PATH.plans))}>
                <span>{q}</span>
                {ok ? <span className="toggle" aria-hidden="true">{open === i ? "−" : "+"}</span> : <span className="row gap8 nowrap"><I.lock /><Tag p={need} /></span>}
              </button>
              {ok && open === i && <div className="lbody">{body}</div>}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function Profile() {
  const { st, set, toast } = useApp();
  const c = st.clinic, u = (k: keyof State["clinic"]) => (v: any) => set((s) => ({ ...s, clinic: { ...s.clinic, [k]: v } }));
  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { const logo = await readLogo(f); set((s) => ({ ...s, clinic: { ...s.clinic, logo } })); toast("Logo guardado"); }
    catch { toast("No pude leer esa imagen. Prueba con PNG o JPG."); }
  };
  return (
    <div className="screen">
      <ToolHead title="Datos para tus PDF" lead="Salen en tu lista de precios, tus presupuestos y tus reportes." />
      <div className="cols l">
        <section className="panel">
          <Txt id="cname" label="Nombre del consultorio" placeholder="Ej. Clínica Dental Sonrisa" value={c.name} onChange={u("name")} />
          <Txt id="cdoc" label="Dentista" placeholder="Ej. Dra. Ana López, céd. prof. 1234567" value={c.doctor} onChange={u("doctor")} />
          <div className="row"><Txt id="ccity" label="Ciudad" placeholder="Ej. Uruapan, Mich." value={c.city} onChange={u("city")} /><Txt id="cphone" label="Teléfono o WhatsApp" type="tel" placeholder="Ej. 452 123 4567" value={c.phone} onChange={u("phone")} /></div>
        </section>
        <section className="panel">
          <h3>Logo</h3>
          <div className="row">
            <div className="logo-prev">{c.logo && c.logo.src ? <img src={c.logo.src} alt="Logo del consultorio" /> : <span className="muted small">Sin logo</span>}</div>
            <div className="stack">
              <label className="btn ghost sm" htmlFor="logo"><I.upload />{c.logo ? "Cambiar logo" : "Subir logo"}</label>
              <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} />
              {c.logo && <button className="btn quiet sm" onClick={() => u("logo")(null)}><I.x />Quitar</button>}
            </div>
          </div>
          <small className="muted">PNG o JPG.</small>
        </section>
      </div>
    </div>
  );
}

export const GUEST_BACKUP = "odontocostos.guest-backup";
export function Backup() {
  const { st, set, saver, toast, cloud } = useApp();
  const [txt, setTxt] = useState(false), [pending, setPending] = useState<State | null>(null), [err, setErr] = useState(""), [paste, setPaste] = useState("");
  const parse = (raw: string) => {
    try { const o = JSON.parse(raw); if (!isValidBackup(o)) throw 0; setPending(normalize(o)); setErr(""); }
    catch { setErr("Eso no es un respaldo de OdontoCostos."); }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    const fr = new FileReader(); fr.onload = () => parse(String(fr.result)); fr.readAsText(f);
  };
  let guest: string | null = null;
  try { guest = localStorage.getItem(GUEST_BACKUP); } catch { /* sin almacenamiento */ }
  const data = JSON.stringify(st);
  const exp = async () => { const r = await saveFile(saver, "odontocostos-respaldo-" + today() + ".json", data); if (r === "saved") toast("Respaldo guardado"); else if (r !== "declined") setTxt(true); };
  const synced = cloud.mode === "live" && cloud.session;
  return (
    <div className="screen">
      <ToolHead title="Tus datos, a salvo" lead={synced ? "Tus datos se guardan en tu cuenta y los ves en cualquier dispositivo. Aquí puedes bajar una copia." : "Sin cuenta, tus datos viven solo en este dispositivo. Haz una copia de vez en cuando o crea tu cuenta para guardarlos en la nube."} />
      <div className="g3">
        <section className="panel">
          <h3>Guardar una copia</h3>
          {saver && <button className="btn" onClick={exp}><I.save />Descargar respaldo</button>}
          <CopyBtn text={data} label="Copiar respaldo como texto" />
          {txt && <textarea className="copybox" readOnly value={data} aria-label="Respaldo en texto" />}
        </section>
        <section className="panel">
          <h3>Restaurar</h3>
          <label className="btn ghost" htmlFor="bfile"><I.upload />Abrir archivo de respaldo</label>
          <input id="bfile" type="file" accept=".json,application/json" hidden onChange={onFile} />
          <div className="field"><label htmlFor="bpaste">O pega aquí el texto del respaldo</label><textarea id="bpaste" className="area mono" value={paste} onChange={(e) => setPaste(e.target.value)} /></div>
          <button className="btn ghost sm start" disabled={!paste.trim()} onClick={() => parse(paste)}>Revisar texto</button>
          {guest && <button className="btn ghost sm start" onClick={() => parse(guest!)}>Usar los datos que tenía sin cuenta</button>}
          {err && <div className="note bad">{err}</div>}
          {pending && (
            <div className="note stack">
              <span>Este respaldo tiene {pending.order.length} tratamientos y {Object.keys(pending.months).length} meses registrados. Va a reemplazar tus datos actuales.</span>
              <div className="row"><button className="btn sm" onClick={() => { set(() => ({ ...pending, edited: true })); setPending(null); setPaste(""); toast("Datos restaurados"); }}>Restaurar</button><button className="btn ghost sm" onClick={() => setPending(null)}>Cancelar</button></div>
            </div>
          )}
        </section>
        <section className="panel">
          <h3>Empezar de nuevo</h3>
          <p className="muted small">Vuelve al consultorio de ejemplo.</p>
          <Confirm label="Volver a los datos de ejemplo" ask={"Se borran todos tus datos" + (synced ? " de tu cuenta" : " de este dispositivo") + ". ¿Seguro?"} yes="Sí, borrar" onYes={() => { set((s) => ({ ...makeDemo(), plan: s.plan }), false); toast("Listo: datos de ejemplo"); }} />
        </section>
      </div>
    </div>
  );
}
