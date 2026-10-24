import { useEffect, useState } from "react";
import { clinicCalc, effClinic, outcome, statusOf, treatCalc, type ClinicCalc, type TreatCalc } from "../../lib/calc";
import { N, money, pct, round50, uid } from "../../lib/format";
import type { Treatment as TreatmentT } from "../../lib/model";
import { can } from "../../lib/plans";
import { Back, Chips, Confirm, I, KV, Locked, Money, Num, NumInput, Peek, Pill, Seg, Tag } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

interface P { t: TreatmentT; r: TreatCalc; cc: ClinicCalc; ut: (patch: Partial<TreatmentT>) => void; id: string }

export function Treatment({ id }: { id: string }) {
  const { st, set, go, toast, wide } = useApp();
  const [view, setView] = useState<"costo" | "precio">("costo");
  const t = st.treatments[id];
  if (!t) return (
    <div className="screen"><p>Este tratamiento ya no existe.</p><button className="btn auto" onClick={() => go(PATH.treatments)}>Ver tratamientos</button></div>
  );
  const cc = clinicCalc(effClinic(st)), r = treatCalc(t, st.materials, cc, st.clinic.target);
  const ut = (patch: Partial<TreatmentT>) => set((s) => ({ ...s, treatments: { ...s.treatments, [id]: { ...s.treatments[id], ...patch } } }));
  const del = () => {
    set((s) => { const tr = { ...s.treatments }; delete tr[id]; return { ...s, treatments: tr, order: s.order.filter((x) => x !== id) }; });
    go(PATH.treatments); toast("Tratamiento eliminado");
  };
  const p: P = { t, r, cc, ut, id };
  return (
    <div className="screen">
      <Back to={PATH.treatments} label="Tratamientos" />
      <div className="field name-field">
        <label htmlFor="tname">Nombre del tratamiento</label>
        <div className="inp big"><input id="tname" className="txt" value={t.name} onChange={(e) => ut({ name: e.target.value })} /></div>
      </div>
      {wide ? (
        <div className="cols">
          <div className="col"><h2 className="col-title">Lo que te cuesta</h2><CostView {...p} /></div>
          <div className="col"><h2 className="col-title">Cuánto cobrar</h2><PriceView {...p} /></div>
        </div>
      ) : (
        <>
          <Seg label="Sección" value={view} onChange={setView} options={[["costo", "Lo que te cuesta"], ["precio", "Cuánto cobrar"]]} />
          {view === "costo" ? <CostView {...p} /> : <PriceView {...p} />}
        </>
      )}
      <Confirm label="Eliminar tratamiento" ask={"¿Eliminar " + t.name + "? También sale de tus registros mensuales."} yes="Sí, eliminar" onYes={del} />
      {!wide && view === "costo" && (
        <Peek label="Ver cuánto cobrar" onClick={() => { setView("precio"); window.scrollTo(0, 0); }}>
          <span><span className="sub">Te cuesta {money(r.cost)}</span><br />Recomendado <span className="num">{money(r.recPrice)}</span></span><I.chev />
        </Peek>
      )}
    </div>
  );
}

function CostView({ t, r, cc, ut, id }: P) {
  const { st, set } = useApp();
  const plus = can(st.plan, "plus");
  const [nm, setNm] = useState(""), [nc, setNc] = useState("");
  const setItems = (items: TreatmentT["items"]) => ut({ items });
  const addMat = () => {
    if (!nm.trim() || !(N(nc) > 0)) return;
    const mid = uid("m");
    set((s) => ({ ...s, materials: [...s.materials, { id: mid, name: nm.trim(), cost: N(nc) }], treatments: { ...s.treatments, [id]: { ...s.treatments[id], items: [...s.treatments[id].items, [mid, 1]] } } }));
    setNm(""); setNc("");
  };
  const unused = st.materials.filter((m) => !t.items.some(([x]) => x === m.id));
  return (
    <div className="stack gap16">
      <section className="panel">
        <h3>Tiempo en el sillón</h3>
        <Num id="min" prefix="" suffix="min" label="¿Cuántos minutos dura?" hint={"Incluye preparar y limpiar la unidad. A " + money(cc.perHour) + " la hora, son " + money(r.time) + "."} value={t.minutes} onChange={(v) => ut({ minutes: v })} />
      </section>
      <section className="panel">
        <div className="row between"><h3>Materiales y desechables</h3><span className="num strong">{money(r.materials)}</span></div>
        {t.items.map(([mid, q], i) => {
          const m = st.materials.find((x) => x.id === mid);
          if (!m) return null;
          return (
            <div className="mat" key={mid}>
              <span className="name">{m.name}<br /><small className="muted num">{money(N(m.cost))} cada uno</small></span>
              <div className="inp qty"><NumInput aria-label={"Cantidad de " + m.name} value={q as any} onChange={(v) => { const it = [...t.items]; it[i] = [mid, v]; setItems(it); }} /></div>
              <button className="btn ghost icon" aria-label={"Quitar " + m.name} onClick={() => setItems(t.items.filter((_, j) => j !== i))}><I.x /></button>
            </div>
          );
        })}
        {t.items.length === 0 && <p className="muted small">Sin materiales todavía.</p>}
        {unused.length > 0 && (
          <div className="field">
            <label htmlFor="addm">Agregar de tu lista</label>
            <div className="inp"><select id="addm" value="" onChange={(e) => e.target.value && setItems([...t.items, [e.target.value, 1]])}>
              <option value="">Elegir material…</option>
              {unused.map((m) => <option key={m.id} value={m.id}>{m.name}, {money(N(m.cost))}</option>)}
            </select></div>
          </div>
        )}
        <div className="row end">
          <div className="field"><label htmlFor="nm">Material nuevo</label><div className="inp"><input id="nm" className="txt" placeholder="Ej. Ionómero" value={nm} onChange={(e) => setNm(e.target.value)} /></div></div>
          <div className="field w110"><label htmlFor="nc">Costo por uso</label><div className="inp"><span className="affix">$</span><NumInput id="nc" value={nc} onChange={(v) => setNc(v)} /></div></div>
          <button className="btn sm" onClick={addMat}>Guardar</button>
        </div>
        <small className="muted">Lo que guardas aquí queda en tu lista de materiales para otros tratamientos.</small>
      </section>
      <section className="panel">
        <h3>Otros costos directos</h3>
        <Num id="lab" label="Laboratorio" value={t.lab} onChange={(v) => ut({ lab: v })} />
        <div className="stack">
          <span className="lbl">Honorarios de otro especialista</span>
          {plus && <Chips label="Cómo le pagas" value={t.feeMode || "fixed"} onChange={(v) => ut({ feeMode: v })} options={[["fixed", "Monto fijo"], ["pct", "Porcentaje del precio"]]} />}
          {t.feeMode === "pct" && plus
            ? <Num id="fpct" prefix="" suffix="%" label="Porcentaje que le pagas" hint="Muchos endodoncistas cobran entre 40% y 50% del tratamiento." value={t.feePct} onChange={(v) => ut({ feePct: v })} />
            : <Num id="fee" label="Monto por caso" hint="Solo si le pagas a alguien más por este caso." value={t.fees} onChange={(v) => ut({ fees: v })} />}
        </div>
        <Num id="oc" label="Otros: radiografía, esterilización, envío" value={t.other} onChange={(v) => ut({ other: v })} />
      </section>
      <section className="panel">
        <KV label="Tiempo de consultorio" value={r.time} />
        <KV label="Costos directos" value={r.direct} />
        {r.pctFee > 0 && <div className="kv"><span>Especialista</span><span className="num">{pct(r.pctFee)} del precio</span></div>}
        <KV cls="grand" label="Te cuesta hacerlo" value={r.cost} />
      </section>
    </div>
  );
}

function PriceView({ t, r, cc, ut }: P) {
  const { st, set } = useApp();
  const c = st.clinic, plus = can(st.plan, "plus");
  const [test, setTest] = useState<number | null>(null);
  const base = plus && N(t.price) > 0 ? N(t.price) : Math.round(r.recPrice || r.minPrice * 1.3 || 0);
  useEffect(() => setTest(null), [t.price, c.target, r.cost]);
  const p = test ?? base, o = outcome(p, r), max = Math.max(Math.ceil(Math.max(r.minPrice * 2.5 || 0, base * 1.5) / 50) * 50, 500);
  return (
    <div className="stack gap16">
      <div className="price-head">
        <div><span className="muted small">Te cuesta</span><Money v={r.cost} cls="md" /></div>
        <div><span className="muted small">Precio mínimo</span><Money v={r.minPrice} cls="md" /></div>
        <div className="rec"><span className="small">Precio recomendado con {N(c.target)}% de margen</span><Money v={r.recPrice} cls="lg" /></div>
      </div>
      <div className="field">
        <label htmlFor="tg">Margen objetivo: <span className="num">{N(c.target)}%</span></label>
        <input id="tg" type="range" min="5" max="60" value={N(c.target)} onChange={(e) => set((x) => ({ ...x, clinic: { ...x.clinic, target: e.target.value } }))} />
        <small>Aplica a todos tus tratamientos.</small>
      </div>
      <section className="panel">
        <div className="row between"><h3>Prueba un precio</h3><Pill s={statusOf(p, r, c.target)} /></div>
        <Money v={p} cls="lg" />
        <input aria-label="Precio de prueba" type="range" min="0" max={max} step="10" value={p} onChange={(e) => setTest(N(e.target.value))} />
        <div className="grid2">
          <div><p className="muted small">Ganancia por tratamiento</p><Money v={o.profit} cls="sm" /></div>
          <div><p className="muted small">Margen real</p><span className="num mid">{pct(o.margin)}</span></div>
        </div>
        {cc.effFee > 0 && <div className="kv"><span>Comisión de la terminal, en promedio</span><span className="num">−{money(p * cc.effFee)}</span></div>}
        {r.pctFee > 0 && <div className="kv"><span>Especialista ({pct(r.pctFee)})</span><span className="num">−{money(p * r.pctFee)}</span></div>}
        <div className="kv"><span>Recargo sobre el costo</span><span className="num">{pct(o.markup)}</span></div>
      </section>
      {plus ? (
        <>
          <MyPrice t={t} r={r} ut={ut} />
          <Ticket t={t} r={r} cc={cc} price={N(t.price) > 0 ? N(t.price) : Number(round50(r.recPrice)) || 0} />
          <Market t={t} r={r} ut={ut} />
        </>
      ) : (
        <Locked need="plus" title="Tu precio, peso por peso">Guarda lo que cobras, mira el ticket de por qué tu precio es ese y compáralo con lo que cobran en tu ciudad.</Locked>
      )}
      <div className="note good"><b>Margen y recargo no son lo mismo.</b> El margen es qué parte del precio te queda ({pct(o.margin)}). El recargo es cuánto le sumaste al costo ({pct(o.markup)}). Si le sumas 30% al costo, tu margen no es 30%: es menor.</div>
      <p className="muted small">Tu sueldo ya está dentro del costo por hora. La ganancia de aquí es extra: sirve para crecer, cambiar equipo o tener un colchón. Cifras aproximadas según tus datos.</p>
    </div>
  );
}

function MyPrice({ t, r, ut }: { t: TreatmentT; r: TreatCalc; ut: P["ut"] }) {
  const { st } = useApp();
  const rec = Number(round50(r.recPrice));
  return (
    <section className="panel">
      <div className="row between"><h3>Tu precio</h3><Tag p="plus" /></div>
      <Num id="myp" label="¿Cuánto cobras hoy por este tratamiento?" hint="Se usa en tu lista de precios, presupuestos y finanzas." value={t.price} onChange={(v) => ut({ price: v })} />
      <div className="row">
        {rec > 0 && N(t.price) !== rec && <button className="btn ghost sm" onClick={() => ut({ price: rec })}>Usar el recomendado, {money(rec)}</button>}
        {N(t.price) > 0 && <Pill s={statusOf(N(t.price), r, st.clinic.target)} />}
      </div>
    </section>
  );
}

/** El desglose del precio como un ticket de caja: cada línea es un peso que tiene dueño. */
function Ticket({ t, r, cc, price }: { t: TreatmentT; r: TreatCalc; cc: ClinicCalc; price: number }) {
  const { st } = useApp();
  if (!(price > 0)) return null;
  const ce = effClinic(st), tot = cc.totalMonthly || 1, share = (v: number) => (r.time * v) / tot;
  const owner = share(cc.ownerPay), clinicCost = r.time - owner, o = outcome(price, r);
  const ownerHour = cc.occupied > 0 ? cc.ownerPay / cc.occupied : 0;
  const sub = ([["renta y servicios", N(ce.rent) + N(ce.services)], ["personal", N(ce.staff)], ["software, publicidad y otros", N(ce.software) + N(ce.ads) + N(ce.other)], ["reposición de equipo", cc.depreciation]] as [string, number][]).filter((x) => x[1] > 0);
  const lines: [string, string, number][] = [
    ["Tu sueldo", N(t.minutes) + " minutos de tu trabajo. Con tu meta de " + money(cc.ownerPay) + " al mes, tu hora vale " + money(ownerHour) + ".", owner],
    ["Gastos del consultorio", "Lo que pagas aunque no llegue nadie: " + sub.map(([a, v]) => a + " " + money(share(v))).join(", ") + ".", clinicCost],
    ["Materiales, laboratorio y especialista", "Solo se gastan en este tratamiento.", r.direct + price * r.pctFee],
  ];
  if (cc.effFee > 0) lines.push(["Comisión de la terminal", pct(cc.effFee) + " en promedio, porque no todos pagan con tarjeta.", price * cc.effFee]);
  return (
    <section className="ticket" aria-label={"Desglose del precio de " + t.name}>
      <div className="ticket-head">
        <div className="row between"><h3>¿Por qué cobrar {money(price)}?</h3><Tag p="plus" /></div>
        <p className="muted small">{t.name}, {N(t.minutes)} minutos. Así se reparte cada peso de {N(t.price) > 0 ? "tu precio" : "el precio recomendado"}.</p>
      </div>
      <ul className="ticket-lines">
        {lines.map(([title, desc, v]) => (
          <li key={title}>
            <div className="tl"><span>{title}</span><i /><span className="num">{money(v)}</span></div>
            <p>{desc}</p>
          </li>
        ))}
      </ul>
      <div className="ticket-total">
        <div className="tl"><span>{o.profit >= 0 ? "Ganancia del consultorio" : "Te falta"}</span><i /><span className="num">{money(Math.abs(o.profit))}</span></div>
        <p>{o.profit >= 0 ? "Lo que gana tu consultorio como negocio, aparte de tu sueldo." : "Con este precio pones dinero de tu bolsa en cada tratamiento."}</p>
      </div>
      <div className={"stamp " + (o.profit >= 0 ? "ok" : "bad")} aria-hidden="true">{o.profit >= 0 ? "Te quedan " + money(o.profit) : "Pierdes " + money(-o.profit)}</div>
    </section>
  );
}

function Market({ t, r, ut }: { t: TreatmentT; r: TreatCalc; ut: P["ut"] }) {
  const { st } = useApp();
  const m = N(t.market), om = m > 0 ? outcome(m, r) : null;
  let v: ["bad" | "" | "good", string] | null = null;
  if (m > 0 && om) {
    if (m < r.minPrice) v = ["bad", "En tu zona cobran menos de lo que te cuesta. Con ese precio perderías " + money(-om.profit) + " por paciente. No compitas por precio aquí: revisa tiempo y materiales, o cobra por el valor que das (garantía, materiales, experiencia)."];
    else if (m < r.recPrice) v = ["", "Si cobras como el mercado ganarías " + money(om.profit) + " con un margen de " + pct(om.margin) + ", menos que tu meta de " + N(st.clinic.target) + "%."];
    else v = ["good", "Tu precio recomendado está por debajo del mercado. Tienes espacio para cobrar hasta " + money(m) + " y ganar " + money(om.profit) + "."];
  }
  return (
    <section className="panel">
      <div className="row between"><h3>Compara con tu ciudad</h3><Tag p="plus" /></div>
      <Num id="mkt" label="¿Cuánto cobran otros consultorios por esto?" hint="Pregunta a colegas o revisa precios publicados cerca de ti." value={t.market} onChange={(x) => ut({ market: x })} />
      {v && <div className={"note " + v[0]}>{v[1]}</div>}
    </section>
  );
}
