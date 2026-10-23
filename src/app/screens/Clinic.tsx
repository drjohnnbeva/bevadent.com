import { clinicCalc, effClinic, empCost } from "../../lib/calc";
import { N, money, sum, uid } from "../../lib/format";
import type { Clinic as ClinicT } from "../../lib/model";
import { can } from "../../lib/plans";
import { I, Legend, Locked, Money, Num, Peek, StackBar, Tag, Title, Txt, type Part } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

export function Clinic() {
  const { st, set, go, wide } = useApp();
  const plus = can(st.plan, "plus"), pro = can(st.plan, "pro"), c = st.clinic, ce = effClinic(st), cc = clinicCalc(ce), full = clinicCalc(c);
  const u = (k: keyof ClinicT) => (v: string) => set((s) => ({ ...s, clinic: { ...s.clinic, [k]: v } }));
  const parts: Part[] = [
    { label: "Tu sueldo", value: cc.ownerPay, color: "var(--s1)" },
    { label: "Personal", value: N(ce.staff), color: "var(--s2)" },
    { label: "Renta y servicios", value: N(ce.rent) + N(ce.services), color: "var(--s3)" },
    { label: "Software, publicidad y otros", value: N(ce.software) + N(ce.ads) + N(ce.other), color: "var(--s4)" },
  ];
  if (plus) parts.push({ label: "Reposición de equipo", value: cc.depreciation, color: "var(--s5)" });

  return (
    <div className="screen">
      <Title step="Paso 1 de 2" title="¿Cuánto te cuesta abrir cada mes?" lead="Pon cifras al mes. Si no sabes una exacta, pon un aproximado y luego la ajustas." />
      <div className="cols l">
        <div className="col">
          <section className="panel">
            <h2>Gastos fijos del mes</h2>
            <div className="row"><Num id="rent" label="Renta" value={c.rent} onChange={u("rent")} /><Num id="serv" label="Luz, agua e internet" value={c.services} onChange={u("services")} /></div>
            <div className="row">
              <Num id="staff" label="Sueldos del personal" hint={pro ? "Sin incluirte a ti. Abajo calculas su costo real." : "Asistente y recepción. Sin incluirte a ti."} value={c.staff} onChange={u("staff")} />
              <Num id="oth" label="Otros gastos" hint="Contador, limpieza, mantenimiento, RPBI" value={c.other} onChange={u("other")} />
            </div>
            <div className="row"><Num id="soft" label="Software" value={c.software} onChange={u("software")} /><Num id="ads" label="Publicidad" value={c.ads} onChange={u("ads")} /></div>
          </section>
          <section className="panel">
            <h2>Tu sueldo como dentista</h2>
            <Num id="own" label="¿Cuánto quieres ganar al mes por tu trabajo?" hint="Es tu sueldo, no tu ganancia. Se cuenta una sola vez aquí; no lo sumes otra vez en cada tratamiento." value={c.ownerPay} onChange={u("ownerPay")} />
          </section>
          <section className="panel">
            <h2>Tu tiempo</h2>
            <div className="row"><Num id="hd" prefix="" suffix="h" label="Horas por día" value={c.hoursDay} onChange={u("hoursDay")} /><Num id="dm" prefix="" suffix="días" label="Días al mes" value={c.daysMonth} onChange={u("daysMonth")} /></div>
            <div className="field">
              <label htmlFor="occ">Ocupación: <span className="num">{N(c.occupancy)}%</span> del tiempo con pacientes</label>
              <input id="occ" type="range" min="10" max="100" value={N(c.occupancy)} onChange={(e) => u("occupancy")(e.target.value)} />
              <small>Casi nadie llena su agenda al 100%. Entre 50% y 70% es común.</small>
            </div>
          </section>
          {plus ? (
            <section className="panel">
              <div className="row between"><h2>Equipo, sillones y tarjetas</h2><Tag p="plus" /></div>
              <div className="row"><Num id="eq" label="Valor de tu equipo" value={c.equipValue} onChange={u("equipValue")} /><Num id="ey" prefix="" suffix="años" label="Vida útil" value={c.equipYears} onChange={u("equipYears")} /></div>
              <div className="note">La reposición no sale cada mes: es lo que necesitas juntar para cambiar tu unidad, compresor o autoclave cuando se acaben. Son {money(cc.depreciation)} al mes.</div>
              <Num id="un" prefix="" suffix="sillones" label="Unidades dentales trabajando al mismo tiempo" value={c.units} onChange={u("units")} />
              <div className="row"><Num id="cs" prefix="" suffix="%" label="Pacientes que pagan con tarjeta" value={c.cardShare} onChange={u("cardShare")} /><Num id="cf" prefix="" suffix="%" label="Comisión de la terminal con IVA" value={c.cardFee} onChange={u("cardFee")} /></div>
              <small className="muted">Si tu terminal cobra 3.5% más IVA, pon 4.06%. Como tus servicios no cobran IVA, el IVA de la comisión no lo recuperas.</small>
            </section>
          ) : (
            <Locked need="plus" title="Equipo, sillones y tarjetas">Suma la reposición de tu equipo, varios sillones y la comisión de la terminal. Son costos que casi nadie cuenta.</Locked>
          )}
          {pro ? <Payroll /> : <Locked need="pro" title="Costo real de tu personal">Calcula lo que de verdad te cuesta cada persona: IMSS, INFONAVIT, aguinaldo, prima vacacional e impuesto sobre nómina.</Locked>}
        </div>
        <div className="col sticky">
          <section className="panel tint">
            <p className="hero-label">Cada hora con paciente te cuesta</p>
            <Money v={cc.perHour} cls="xl" />
            <StackBar parts={parts} label="De qué se compone tu costo mensual" />
            <div><Legend parts={parts} /><div className="kv grand"><span>Costo total al mes</span><span className="num">{money(cc.totalMonthly)}</span></div></div>
            <p className="muted small">Tienes <span className="num">{Math.round(cc.available)}</span> horas de sillón disponibles y usas <span className="num">{Math.round(cc.occupied)}</span>. Con la agenda llena, la hora te costaría <span className="num">{money(cc.perHourFull)}</span>. Las horas vacías también se pagan.</p>
            {!plus && full.perHour - cc.perHour >= 1 && <div className="note">Te faltan costos ocultos: con la reposición de tu equipo, tu hora cuesta {money(full.perHour)}. Están en el plan Plus.</div>}
          </section>
          <button className="btn" onClick={() => go(PATH.treatments)}>Siguiente: tus tratamientos</button>
        </div>
      </div>
      {!wide && (
        <Peek><span><span className="sub">Cada hora con paciente te cuesta</span><br />Total al mes <span className="num">{money(cc.totalMonthly)}</span></span><Money v={cc.perHour} cls="md" /></Peek>
      )}
    </div>
  );
}

function Payroll() {
  const { st, set, toast } = useApp();
  const p = st.payroll, rows = p.list.map((e) => ({ e, ...empCost(e, p) })), total = sum(rows, (r) => r.cost);
  const up = (patch: Partial<typeof p>) => set((s) => ({ ...s, payroll: { ...s.payroll, ...patch } }));
  const ue = (id: string, patch: object) => up({ list: p.list.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <section className="panel">
      <div className="row between"><h2>Costo real de tu personal</h2><Tag p="pro" /></div>
      <p className="muted small">El sueldo es solo una parte. Aquí sumamos aguinaldo (15 días al año), prima vacacional (25% de 12 días) y, si está en el IMSS, cuotas patronales e impuesto estatal sobre nómina.</p>
      {rows.map(({ e, agui, prima, soc, cost }) => (
        <div className="stack divided" key={e.id}>
          <div className="row end"><Txt id={"role" + e.id} label="Puesto" value={e.role} onChange={(v) => ue(e.id, { role: v })} /><Num id={"sal" + e.id} label="Sueldo mensual" value={e.salary} onChange={(v) => ue(e.id, { salary: v })} /></div>
          <div className="row between">
            <label className="check"><input type="checkbox" checked={!!e.imss} onChange={(ev) => ue(e.id, { imss: ev.target.checked })} />Dada de alta en el IMSS</label>
            <button className="btn ghost icon" aria-label={"Quitar " + (e.role || "puesto")} onClick={() => up({ list: p.list.filter((x) => x.id !== e.id) })}><I.x /></button>
          </div>
          <div className="kv"><span className="muted">Aguinaldo y prima vacacional</span><span className="num">{money(agui + prima)}</span></div>
          {e.imss && <div className="kv"><span className="muted">IMSS, INFONAVIT y nómina</span><span className="num">{money(soc)}</span></div>}
          <div className="kv tot"><span>Te cuesta al mes</span><span className="num">{money(cost)}{N(e.salary) > 0 && <span className="muted small"> +{Math.round((cost / N(e.salary) - 1) * 100)}%</span>}</span></div>
        </div>
      ))}
      <button className="btn ghost sm start" onClick={() => up({ list: [...p.list, { id: uid("p"), role: "", salary: "", imss: true }] })}><I.plus />Agregar persona</button>
      <div className="row"><Num id="cargas" prefix="" suffix="%" label="Cuotas IMSS e INFONAVIT" hint="Aproximado para sueldos bajos y medios" value={p.cargas} onChange={(v) => up({ cargas: v })} /><Num id="isn" prefix="" suffix="%" label="Impuesto sobre nómina" hint="Depende de tu estado" value={p.isn} onChange={(v) => up({ isn: v })} /></div>
      {rows.length > 0 && (
        <>
          <div className="kv grand"><span>Costo real de tu equipo</span><span className="num">{money(total)}</span></div>
          {Math.abs(total - N(st.clinic.staff)) >= 1 && (
            <div className="note plain stack">
              <span>En tus gastos tienes {money(N(st.clinic.staff))} de personal. El costo real es {money(total)}.</span>
              <button className="btn sm start" onClick={() => { set((s) => ({ ...s, clinic: { ...s.clinic, staff: Math.round(total) } })); toast("Gastos de personal actualizados"); }}>Usar {money(total)} en mis gastos</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
