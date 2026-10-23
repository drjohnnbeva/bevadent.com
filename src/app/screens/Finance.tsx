import { useState } from "react";
import { avgPrice, billingFor, clinicCalc, effClinic, lossTolerance, monthPL, outcome, priceOf, scenario, treatCalc } from "../../lib/calc";
import { cap, compact, mkey, mlabel, mlow, mshift, money, N, slug, sum, uid } from "../../lib/format";
import type { MonthRecord } from "../../lib/model";
import { pdfMonth } from "../../lib/pdf";
import { can, PLANS } from "../../lib/plans";
import { REGIME, resicoRate } from "../../lib/tax";
import { Chips, FileBtn, I, KV, Legend, Money, Num, Peek, Seg, StackBar, Stepper, Title, Txt } from "../../ui/kit";
import { useApp } from "../ctx";
import { parts100 } from "../parts";
import { PATH } from "../router";

type View = "mes" | "isr" | "metas" | "analisis";
interface MP { mk: string; setMk: (k: string) => void }

export function Finance() {
  const { st, go } = useApp();
  const [view, setView] = useState<View>("mes"), [mk, setMk] = useState(mkey());
  if (!can(st.plan, "pro")) return <FinanceLocked onPlans={() => go(PATH.plans)} />;
  const p = { mk, setMk };
  return (
    <div className="screen">
      <Title title="Tus números, como los ve tu contador" lead="Registra lo que atiendes cada mes y ve lo que de verdad te queda después de gastos e impuestos." />
      <div className="seg-wrap"><Seg label="Sección" value={view} onChange={setView} options={[["mes", "Mi mes"], ["isr", "Impuestos"], ["metas", "Metas"], ["analisis", "Análisis"]]} /></div>
      {view === "mes" && <Month {...p} />}
      {view === "isr" && <Taxes {...p} />}
      {view === "metas" && <Goals {...p} />}
      {view === "analisis" && <Analysis {...p} />}
    </div>
  );
}

function FinanceLocked({ onPlans }: { onPlans: () => void }) {
  const { st } = useApp();
  const pl = monthPL({ ...st, plan: "pro" }, mkey());
  return (
    <div className="screen">
      <Title title="Tu contador, en el bolsillo" lead="Registra lo que atiendes cada mes y ve lo que de verdad te queda después de gastos e impuestos." />
      <div className="cols">
        <section className="panel" aria-hidden="true">
          <div className="blur stack">
            <KV cls="tot" label="Ingresos cobrados" value={pl.ing} />
            <KV cls="ind" label="Materiales y comisiones" value={pl.card + pl.direct} neg />
            <KV cls="ind" label="Gastos fijos" value={pl.fixed + pl.extras} neg />
            <KV cls="ind" label="ISR estimado" value={pl.isr} neg />
            <KV cls="grand" label="Te queda libre" value={pl.net} />
          </div>
        </section>
        <section className="panel">
          <h2>Lo que incluye Pro</h2>
          <ul className="feats">{PLANS.pro.feats.slice(1).map((f) => <li key={f}><I.check />{f}</li>)}</ul>
          <button className="btn" onClick={onPlans}>Ver el plan Pro</button>
        </section>
      </div>
    </div>
  );
}

function MonthNav({ mk, setMk }: MP) {
  return (
    <div className="monthnav">
      <button className="btn ghost icon" aria-label="Mes anterior" onClick={() => setMk(mshift(mk, -1))}><I.back /></button>
      <h2>{mlabel(mk)}</h2>
      <button className="btn ghost icon" aria-label="Mes siguiente" onClick={() => setMk(mshift(mk, 1))}><I.chev /></button>
    </div>
  );
}

function Month({ mk, setMk }: MP) {
  const { st, set, wide } = useApp();
  const [nm, setNm] = useState(""), [na, setNa] = useState("");
  const mo = st.months[mk] || { counts: {}, extras: [] }, counts = mo.counts || {}, pl = monthPL(st, mk), cc = pl.cc, prevK = mshift(mk, -1), prev = st.months[prevK];
  const setMo = (fn: (cur: MonthRecord) => Partial<MonthRecord>) => set((s) => {
    const cur = s.months[mk] || { counts: {}, extras: [] };
    return { ...s, months: { ...s.months, [mk]: { ...cur, ...fn(cur) } } };
  });
  const setCount = (id: string, v: string | number) => setMo((cur) => ({ counts: { ...cur.counts, [id]: v } }));
  const typical = () => {
    const n = st.order.length || 1, c: Record<string, number> = {};
    st.order.forEach((id) => { const hrs = N(st.treatments[id].minutes) / 60; c[id] = hrs > 0 ? Math.round(cc.occupied / n / hrs) : 0; });
    setMo(() => ({ counts: c }));
  };
  const addExtra = () => {
    if (!nm.trim() || !(N(na) > 0)) return;
    setMo((cur) => ({ extras: [...(cur.extras || []), { id: uid("e"), name: nm.trim(), amount: N(na) }] }));
    setNm(""); setNa("");
  };
  const nextK = mshift(mk, 1), aguinaldo = sum(st.payroll.list, (e) => N(e.salary) / 24), apart = pl.isr + pl.reserve + aguinaldo;
  const items = st.order.map((id) => { const t = st.treatments[id], r = treatCalc(t, st.materials, cc, st.clinic.target); return { id, t, p: priceOf(t, r), own: N(t.price) > 0, n: counts[id] ?? "" }; });

  return (
    <div className="stack gap20">
      <MonthNav mk={mk} setMk={setMk} />
      <div className="cols">
        <div className="col">
          <section className="panel">
            <div className="row between"><h3>Tratamientos realizados</h3><span className="muted small"><span className="num">{pl.count}</span> tratamientos, <span className="num">{Math.round(pl.hours)}</span> h</span></div>
            {pl.count === 0 && (
              <div className="note plain stack">
                <span>Aún no registras tratamientos en {mlow(mk)}.</span>
                <div className="row">
                  {prev && <button className="btn sm" onClick={() => setMo(() => ({ counts: { ...prev.counts } }))}>Copiar {mlow(prevK)}</button>}
                  <button className="btn ghost sm" onClick={typical}>Llenar con un mes típico</button>
                </div>
              </div>
            )}
            {wide ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Tratamiento</th><th className="r">Precio</th><th>Cantidad</th><th className="r">Subtotal</th></tr></thead>
                  <tbody>{items.map((x) => (
                    <tr key={x.id}>
                      <td><b>{x.t.name}</b>{!x.own && <><br /><span className="muted small">precio recomendado</span></>}</td>
                      <td className="r num">{money(x.p)}</td>
                      <td><Stepper label={x.t.name} value={x.n} onChange={(v) => setCount(x.id, v)} /></td>
                      <td className="r num">{money(x.p * N(x.n))}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr><td>Total</td><td /><td className="num">{pl.count}</td><td className="r num">{money(pl.ing)}</td></tr></tfoot>
                </table>
              </div>
            ) : items.map((x) => (
              <div className="mat" key={x.id}>
                <span className="name"><b>{x.t.name}</b><br /><small className="muted num">{money(x.p)}{x.own ? "" : ", recomendado"}</small></span>
                <Stepper label={x.t.name} value={x.n} onChange={(v) => setCount(x.id, v)} />
              </div>
            ))}
            <small className="muted">Usa tu agenda o tu libreta de cobros. Tienes {Math.round(cc.occupied)} horas con paciente con tu ocupación de {N(st.clinic.occupancy)}%.</small>
          </section>
          <section className="panel">
            <h3>Gastos extra de este mes</h3>
            {(mo.extras || []).map((e) => (
              <div className="mat" key={e.id}>
                <span className="name">{e.name}</span><span className="num">{money(N(e.amount))}</span>
                <button className="btn ghost icon" aria-label={"Quitar " + e.name} onClick={() => setMo((cur) => ({ extras: cur.extras.filter((x) => x.id !== e.id) }))}><I.x /></button>
              </div>
            ))}
            <div className="row end">
              <Txt id="exn" label="Concepto" placeholder="Ej. Reparación del compresor" value={nm} onChange={setNm} />
              <div className="field w120"><label htmlFor="exa">Monto</label><div className="inp"><span className="affix">$</span><input id="exa" type="number" step="any" inputMode="decimal" value={na} onChange={(e) => setNa(e.target.value)} /></div></div>
              <button className="btn sm" onClick={addExtra}>Agregar</button>
            </div>
          </section>
        </div>
        <div className="col">
          {pl.has ? (
            <>
              <section className="panel">
                <h3>Estado de resultados</h3>
                <div>
                  <KV cls="tot" label="Ingresos cobrados" value={pl.ing} />
                  <KV cls="ind" label="Comisiones de la terminal" value={pl.card} neg />
                  <KV cls="ind" label="Materiales, laboratorio y especialistas" value={pl.direct} neg />
                  <KV cls="tot" label="Utilidad bruta" value={pl.gross} />
                  <KV cls="ind" label="Gastos fijos: renta, personal, servicios" value={pl.fixed} neg />
                  {pl.extras > 0 && <KV cls="ind" label="Gastos extra del mes" value={pl.extras} neg />}
                  <KV cls="tot" label="Utilidad de operación" value={pl.op} />
                  <KV cls="ind" label="Reserva para reponer equipo" value={pl.reserve} neg />
                  <KV cls="ind" label={"ISR estimado, " + REGIME[st.tax.regime]} value={pl.isr} neg />
                  <KV cls="grand" label="Te queda libre" value={pl.net} />
                </div>
                <p className="muted small">Tu sueldo no aparece como gasto: lo que te queda libre es tu ingreso. Abajo lo comparamos con tu meta.</p>
              </section>
              <section className="panel">
                <h3>¿Cuánto te queda?</h3>
                {pl.net >= pl.salary
                  ? <div className="note good">Te alcanzó para tu sueldo de {money(pl.salary)} y sobran {money(pl.net - pl.salary)} de ganancia para el consultorio.</div>
                  : <div className={"note " + (pl.net < 0 ? "bad" : "")}>{pl.net < 0 ? "Este mes el consultorio perdió " + money(-pl.net) + ". No alcanzó ni para tu sueldo." : "Te faltaron " + money(pl.salary - pl.net) + " para llegar a tu sueldo de " + money(pl.salary) + "."}</div>}
                {pl.ing > 0 && pl.net > 0 && (
                  <>
                    <p>De cada <b>$100</b> que cobras, te quedan <b className="num">${Math.round((pl.net / pl.ing) * 100)}</b>.</p>
                    <StackBar parts={parts100(pl)} label="A dónde se va lo que cobras" />
                    <Legend parts={parts100(pl)} />
                  </>
                )}
              </section>
              <section className="panel">
                <h3>Aparta este mes</h3>
                <KV label={"ISR, a pagar antes del 17 de " + mlow(nextK)} value={pl.isr} />
                <KV label="Reserva para reponer equipo" value={pl.reserve} />
                {aguinaldo > 0 && <KV label="Aguinaldo de tu equipo, para diciembre" value={aguinaldo} />}
                <KV cls="grand" label="Total para apartar" value={apart} />
                <p className="muted small">Pásalo a otra cuenta el día que cobras. Así no te gastas dinero que ya tiene dueño.</p>
              </section>
              <FileBtn label="Descargar reporte del mes en PDF" name={slug(st.clinic.name) + "-resultados-" + mk + ".pdf"} make={() => pdfMonth(st, mk)} />
            </>
          ) : (
            <section className="panel"><h3>Estado de resultados</h3><p className="muted">Registra lo que atendiste en {mlow(mk)} y aquí aparece tu estado de resultados.</p></section>
          )}
        </div>
      </div>
      {!wide && pl.has && <Peek><span><span className="sub">{mlabel(mk)}: cobraste {money(pl.ing)}</span><br />Te queda libre</span><Money v={pl.net} cls="md" /></Peek>}
    </div>
  );
}

function Taxes({ mk, setMk }: MP) {
  const { st, set } = useApp();
  const pl = monthPL(st, mk), reg = st.tax.regime, ut = (patch: Partial<typeof st.tax>) => set((s) => ({ ...s, tax: { ...s.tax, ...patch } }));
  const diff = pl.isrProf - pl.isrResico, share = Math.min(100, Math.max(0, N(st.tax.pmShare))) / 100, billed = pl.ing * share;
  const cheaper = diff > 0 ? "resico" : "prof";
  return (
    <div className="stack gap20">
      <MonthNav mk={mk} setMk={setMk} />
      <div className="cols">
        <div className="col">
          <section className="panel">
            <h3>¿En qué régimen estás?</h3>
            <Chips label="Régimen fiscal" value={reg} onChange={(v) => ut({ regime: v })} options={[["resico", "RESICO"], ["prof", "Actividad profesional"]]} />
            <p className="muted small">Lo usamos en tu estado de resultados y en tus metas. Si no sabes, revisa tu Constancia de Situación Fiscal.</p>
          </section>
          {!pl.has ? <div className="note plain">Registra tus tratamientos en Mi mes para estimar tus impuestos.</div> : (
            <section className="panel">
              <h3>Tu ISR de {mlow(mk)} en los dos regímenes</h3>
              <div className="kv"><span><b>RESICO</b><br /><span className="muted small">{resicoRate(pl.ing)}% sobre los {money(pl.ing)} que cobraste. No se restan gastos.</span></span><span className="num">{money(pl.isrResico)}</span></div>
              <div className="kv"><span><b>Actividad profesional</b><br /><span className="muted small">Tarifa 2026 sobre tu utilidad de {money(Math.max(0, pl.taxBase))}: lo que cobraste menos tus gastos con factura.</span></span><span className="num">{money(pl.isrProf)}</span></div>
              {Math.abs(diff) >= 1 && <div className={"note " + (cheaper === reg ? "good" : "")}>Con tus números de este mes, {REGIME[cheaper]} te deja pagar {money(Math.abs(diff))} menos.{cheaper !== reg && " Platícalo con tu contador."}</div>}
              {pl.ing * 12 > 3500000 && <div className="note bad">A este ritmo cobrarías más de $3.5 millones al año, el tope de RESICO.</div>}
              <p className="muted small">Supone que todos tus gastos tienen factura. RESICO tiene requisitos, entre ellos ingresos menores a $3.5 millones al año. Revísalos con tu contador antes de cambiarte.</p>
            </section>
          )}
        </div>
        <div className="col">
          {pl.has && (
            <section className="panel">
              <h3>Retenciones</h3>
              <Num id="pms" prefix="" suffix="%" label="¿Qué parte de lo que cobras le facturas a empresas o aseguradoras?" value={st.tax.pmShare} onChange={(v) => ut({ pmShare: v })} />
              {billed > 0 && <KV label={"Te retienen " + (reg === "resico" ? "1.25%" : "10%") + " de " + money(billed)} value={billed * (reg === "resico" ? 0.0125 : 0.1)} />}
              <p className="muted small">Las personas morales retienen parte de tu ISR al pagarte. No es un gasto extra: lo restas de tu pago mensual.</p>
            </section>
          )}
          <section className="panel">
            <h3>IVA</h3>
            <p className="small">Como cirujano dentista persona física, tus servicios están <b>exentos de IVA</b> (artículo 15, fracción XIV de la Ley del IVA). No lo cobras y no lo declaras.</p>
            <div className="note">El IVA que pagas en materiales, laboratorio, renta y comisiones no lo recuperas. Por eso aquí todo va con IVA incluido: es costo tuyo.</div>
            <p className="muted small">Si vendes productos, como cepillos o kits de blanqueamiento, o facturas como sociedad mercantil, ahí sí cobras IVA de 16%.</p>
          </section>
          <p className="muted small">Declaras cada mes, a más tardar el día 17 del mes siguiente. Estimación con la tarifa de ISR 2026 y la tabla de RESICO. No sustituye a tu contador.</p>
        </div>
      </div>
    </div>
  );
}

function Goals({ mk, setMk }: MP) {
  const { st, set } = useApp();
  const pl = monthPL(st, mk), cc = pl.cc, days = Math.max(1, N(st.clinic.daysMonth));
  const ticket = pl.count ? pl.ing / pl.count : avgPrice(st), goalNet = N(st.goal.net) || cc.ownerPay;
  const be = billingFor(st, pl, 0), gb = billingFor(st, pl, goalNet);
  const perDay = (B: number) => (ticket > 0 ? Math.ceil(B / ticket / days) : 0);
  return (
    <div className="stack gap20">
      <MonthNav mk={mk} setMk={setMk} />
      <p className="muted small">{pl.has ? "Calculado con la mezcla de tratamientos de " + mlow(mk) + "." : "Sin registros este mes: usamos el promedio de tu catálogo."}</p>
      <div className="cols">
        <section className="panel">
          <h3>Punto de equilibrio</h3>
          <div><p className="muted small">Para no perder necesitas cobrar al mes</p><Money v={be} cls="lg" /></div>
          <p className="small">Son {money(be / days)} por día de consulta: unos <b className="num">{perDay(be)}</b> pacientes al día con tu ticket promedio de {money(ticket)}.</p>
          <p className="muted small">Aquí cubres gastos fijos, materiales, comisiones, reserva de equipo e impuestos, pero todavía no te pagas a ti.</p>
        </section>
        <section className="panel">
          <h3>Tu meta</h3>
          <Num id="goal" label="¿Cuánto quieres que te quede libre al mes?" hint={"Si lo dejas vacío usamos tu sueldo meta de " + money(cc.ownerPay) + "."} value={st.goal.net} onChange={(v) => set((s) => ({ ...s, goal: { ...s.goal, net: v } }))} />
          <div><p className="muted small">Necesitas cobrar al mes</p><Money v={gb} cls="lg" /></div>
          <p className="small">Son {money(gb / days)} por día: unos <b className="num">{perDay(gb)}</b> pacientes al día.</p>
          {pl.has && (
            <>
              <div className="stack tight">
                <div className="meter" role="img" aria-label={"Llevas " + Math.round(Math.min(1, pl.ing / gb) * 100) + "% de tu meta"}><i style={{ width: Math.min(100, (pl.ing / gb) * 100) + "%" }} /></div>
                <div className="row between small"><span>{cap(mlow(mk))}: {money(pl.ing)}</span><span className="muted">Meta: {money(gb)}</span></div>
              </div>
              {pl.ing >= gb ? <div className="note good">Con lo que cobraste en {mlow(mk)} ya alcanzas tu meta.</div>
                : <div className="note">Te faltan {money(gb - pl.ing)} de cobro al mes: unos {ticket > 0 ? Math.ceil((gb - pl.ing) / ticket) : 0} pacientes más, o subir tus precios.</div>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Analysis({ mk }: MP) {
  return (
    <div className="stack gap20">
      <div className="cols">
        <section className="panel">
          <h3>¿Qué tratamiento te deja más por hora?</h3>
          <p className="muted small">Ganancia por hora de sillón, después de pagar materiales, gastos fijos y tu sueldo. Úsalo para decidir qué promover y qué revisar.</p>
          <Rank />
        </section>
        <Scenarios mk={mk} />
      </div>
      <section className="panel"><h3>Tus últimos 6 meses</h3><Trend mk={mk} /></section>
    </div>
  );
}

function Rank() {
  const { st } = useApp();
  const cc = clinicCalc(effClinic(st));
  const rows = st.order.map((id) => { const t = st.treatments[id], r = treatCalc(t, st.materials, cc, st.clinic.target), o = outcome(priceOf(t, r), r); return { id, name: t.name, v: r.hours > 0 ? o.profit / r.hours : 0 }; }).sort((a, b) => b.v - a.v);
  if (!rows.length) return <p className="muted">Agrega tratamientos para comparar.</p>;
  const pos = Math.max(0, ...rows.map((r) => r.v)), neg = Math.min(0, ...rows.map((r) => r.v)), span = pos - neg || 1, z = (-neg / span) * 100;
  return (
    <div className="rank">
      {rows.map((r) => {
        const w = (Math.abs(r.v) / span) * 100;
        return (
          <div key={r.id} className="stack tight">
            <div className="row between nowrap"><span className="strong wrap">{r.name}</span><span className={"num small nowrap" + (r.v < 0 ? " neg" : "")}>{money(r.v)} por hora{r.v < 0 ? ", pierdes" : ""}</span></div>
            <div className="track">{neg < 0 && <span className="zero" style={{ left: z + "%" }} />}<i style={{ left: (r.v >= 0 ? z : z - w) + "%", width: Math.max(w, 0.6) + "%", background: r.v < 0 ? "var(--red)" : "var(--scrub)" }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Scenarios({ mk }: { mk: string }) {
  const { st } = useApp();
  const [pu, setPu] = useState(10), [vol, setVol] = useState(0), [fx, setFx] = useState("");
  const pl = monthPL(st, mk);
  if (!pl.has) return <section className="panel"><h3>¿Qué pasa si…?</h3><p className="muted">Registra un mes en Mi mes para simular cambios.</p></section>;
  const sc = scenario(st, pl, pu / 100, vol / 100, N(fx)), d = sc.net - pl.net, lose = lossTolerance(st, pl, pu / 100, N(fx));
  return (
    <section className="panel">
      <h3>¿Qué pasa si…?</h3>
      <p className="muted small">Partimos de lo que registraste en {mlow(mk)}. Mueve las palancas.</p>
      <div className="field"><label htmlFor="spu">Cambio en tus precios: <span className="num">{pu > 0 ? "+" : ""}{pu}%</span></label><input id="spu" type="range" min="-20" max="30" value={pu} onChange={(e) => setPu(+e.target.value)} /></div>
      <div className="field"><label htmlFor="svo">Pacientes: <span className="num">{vol > 0 ? "+" : ""}{vol}%</span></label><input id="svo" type="range" min="-40" max="50" value={vol} onChange={(e) => setVol(+e.target.value)} /></div>
      <Num id="sfx" label="Nuevo gasto fijo al mes" hint="Por ejemplo, contratar otra asistente o rentar un segundo consultorio." value={fx} onChange={setFx} />
      <div className="compare">
        <div><span className="muted small">Hoy te queda</span><Money v={pl.net} cls="md" /></div>
        <div className="hl"><span className="small">Con estos cambios</span><Money v={sc.net} cls="md" /></div>
      </div>
      <p className={"small" + (d < 0 ? " neg" : "")}><b className="num">{d >= 0 ? "+" : "−"}{money(Math.abs(d))}</b> al mes{d >= 0 ? " más" : " menos"} para ti.</p>
      {lose !== null && lose > 0 && <div className="note good">Si subes tus precios {pu}%, podrías perder hasta {Math.round(lose * 100)}% de tus pacientes y seguirías ganando lo mismo que hoy.</div>}
    </section>
  );
}

const niceStep = (raw: number) => { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
function barPath(x: number, w: number, y0: number, y1: number) {
  const hgt = Math.abs(y1 - y0), r = Math.min(4, hgt / 2, w / 2);
  if (hgt < 0.5) return "";
  return y1 < y0
    ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
    : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}
function Trend({ mk }: { mk: string }) {
  const { st, wide } = useApp();
  const keys = [0, 1, 2, 3, 4, 5].map((i) => mshift(mk, i - 5)), data = keys.map((k) => monthPL(st, k));
  const [sel, setSel] = useState(5);
  if (data.filter((d) => d.has).length < 2) return <p className="muted">Registra al menos dos meses para ver cómo vas.</p>;
  const W = wide ? 880 : 340, H = wide ? 240 : 190, ml = wide ? 56 : 44, mr = 6, mt = 12, mb = 26;
  const vals = data.flatMap((d) => (d.has ? [d.ing, d.net] : [0]));
  const maxV = Math.max(1, ...vals), minV = Math.min(0, ...vals), step = niceStep((maxV - minV) / 3), top = Math.ceil(maxV / step) * step, bot = Math.floor(minV / step) * step;
  const y = (v: number) => mt + ((top - v) / (top - bot)) * (H - mt - mb), bw = (W - ml - mr) / 6, barW = Math.min(wide ? 24 : 14, (bw - 12) / 2), ticks: number[] = [];
  for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);
  const s = data[sel];
  return (
    <div className="stack">
      <p className="small" aria-live="polite"><b>{cap(mlow(keys[sel]))}:</b> {s.has ? <>cobraste <span className="num">{money(s.ing)}</span> y te quedaron <span className={"num" + (s.net < 0 ? " neg" : "")}>{money(s.net)}</span></> : "sin registros"}</p>
      <svg className="chart" viewBox={"0 0 " + W + " " + H} role="img" aria-label="Lo que cobraste y lo que te quedó en los últimos seis meses">
        {ticks.map((v) => <g key={"t" + v}><line className={v === 0 ? "base" : "grid"} x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} /><text x={ml - 6} y={y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}
        {data.map((d, i) => {
          const cx = ml + i * bw + bw / 2, x0 = cx - barW - 1;
          return (
            <g key={keys[i]}>
              {i === sel && <rect className="sel" x={ml + i * bw + 2} y={mt} width={bw - 4} height={H - mt - mb} rx="6" />}
              {d.has && <><path d={barPath(x0, barW, y(0), y(d.ing))} fill="var(--s1)" /><path d={barPath(x0 + barW + 2, barW, y(0), y(d.net))} fill="var(--s2)" /></>}
              <text x={cx} y={H - 8} textAnchor="middle">{mlabel(keys[i], { month: "short" }).replace(".", "")}</text>
              <rect className="hit" x={ml + i * bw} y="0" width={bw} height={H} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}><title>{mlabel(keys[i])}</title></rect>
            </g>
          );
        })}
      </svg>
      <div className="row small gap16"><span className="row gap8"><i className="sw" style={{ background: "var(--s1)" }} />Lo que cobraste</span><span className="row gap8"><i className="sw" style={{ background: "var(--s2)" }} />Te quedó libre</span></div>
    </div>
  );
}
