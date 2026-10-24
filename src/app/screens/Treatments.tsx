import { useState } from "react";
import { treatRows } from "../../lib/calc";
import { N, money, uid } from "../../lib/format";
import { T, type Material } from "../../lib/model";
import { can, FREE_TREATS } from "../../lib/plans";
import { cleanNum, I, Locked, Num, Seg, Title, Txt } from "../../ui/kit";
import { useApp } from "../ctx";
import { treatmentPath } from "../router";
import { TreatList, TreatTable } from "./Treatlist";

export function Treatments() {
  const { st, set, go, wide } = useApp();
  const [tab, setTab] = useState<"t" | "m">("t");
  const plus = can(st.plan, "plus"), rows = treatRows(st), canAdd = plus || st.order.length < FREE_TREATS;
  const add = () => {
    const id = uid("t");
    set((s) => ({ ...s, treatments: { ...s.treatments, [id]: T("Nuevo tratamiento", 30, []) }, order: [...s.order, id] }));
    go(treatmentPath(id));
  };
  return (
    <div className="screen">
      <Title step="Paso 2 de 2" title="¿Cuánto te cuesta cada tratamiento?" lead="Toca un tratamiento para ajustar minutos, materiales y laboratorio. El precio se recalcula solo." />
      <div className="seg-wrap"><Seg label="Ver" value={tab} onChange={setTab} options={[["t", "Tratamientos"], ["m", "Materiales"]]} /></div>
      {tab === "t" ? (
        <>
          <section className="panel">
            {rows.length ? (wide ? <TreatTable rows={rows} plus={plus} full /> : <TreatList rows={rows} plus={plus} minutes />) : <p className="muted">No tienes tratamientos. Agrega el primero.</p>}
          </section>
          {canAdd ? <button className="btn ghost auto" onClick={add}><I.plus />Agregar tratamiento</button>
            : <Locked need="plus" title="Agrega todos tus tratamientos">En Gratis puedes tener hasta {FREE_TREATS}. Con Plus agregas los que quieras: carillas, implantes, blanqueamiento, ortopedia.</Locked>}
        </>
      ) : <Materials />}
    </div>
  );
}

function Materials() {
  const { st, set, wide } = useApp();
  const plus = can(st.plan, "plus");
  const [nm, setNm] = useState(""), [nc, setNc] = useState(""), [pp, setPp] = useState(""), [pu, setPu] = useState("");
  const upd = (id: string, patch: Partial<Material>) => set((s) => ({
    ...s, materials: s.materials.map((m) => {
      if (m.id !== id) return m;
      const n = { ...m, ...patch };
      if (("packPrice" in patch || "packUses" in patch) && N(n.packPrice) > 0 && N(n.packUses) > 0) n.cost = +(N(n.packPrice) / N(n.packUses)).toFixed(2);
      return n;
    }),
  }));
  const used = (id: string) => st.order.filter((t) => st.treatments[t].items.some(([x]) => x === id)).length;
  const del = (id: string) => set((s) => ({ ...s, materials: s.materials.filter((m) => m.id !== id), treatments: Object.fromEntries(Object.entries(s.treatments).map(([k, t]) => [k, { ...t, items: t.items.filter(([x]) => x !== id) }])) }));
  const byPack = plus && N(pp) > 0 && N(pu) > 0, newCost = byPack ? N(pp) / N(pu) : N(nc);
  const add = () => {
    if (!nm.trim() || !(newCost > 0)) return;
    set((s) => ({ ...s, materials: [...s.materials, { id: uid("m"), name: nm.trim(), cost: +newCost.toFixed(2), ...(byPack ? { packPrice: N(pp), packUses: N(pu) } : {}) }] }));
    setNm(""); setNc(""); setPp(""); setPu("");
  };
  const setCost = (m: Material, v: string) => upd(m.id, { cost: v, packPrice: "", packUses: "" });
  const list = wide ? (
    <section className="panel">
      <h2>Tus materiales</h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Material</th>{plus && <th>Paquete</th>}{plus && <th>Rinde</th>}<th>Costo por uso</th><th className="r">Lo usan</th><th aria-hidden="true" /></tr></thead>
          <tbody>
            {st.materials.map((m) => (
              <tr key={m.id}>
                <td style={{ minWidth: 220 }}><div className="inp"><input className="txt" aria-label="Nombre del material" value={m.name} onChange={(e) => upd(m.id, { name: e.target.value })} /></div></td>
                {plus && <td style={{ minWidth: 120 }}><div className="inp"><span className="affix">$</span><input aria-label={"Precio del paquete de " + m.name} type="text" inputMode="decimal" value={(m.packPrice as any) ?? ""} onChange={(e) => upd(m.id, { packPrice: cleanNum(e.target.value) })} /></div></td>}
                {plus && <td style={{ minWidth: 110 }}><div className="inp"><input aria-label={"Usos por paquete de " + m.name} type="text" inputMode="decimal" value={(m.packUses as any) ?? ""} onChange={(e) => upd(m.id, { packUses: cleanNum(e.target.value) })} /><span className="affix">usos</span></div></td>}
                <td style={{ minWidth: 120 }}><div className="inp"><span className="affix">$</span><input aria-label={"Costo por uso de " + m.name} type="text" inputMode="decimal" value={(m.cost as any) ?? ""} onChange={(e) => setCost(m, cleanNum(e.target.value))} /></div></td>
                <td className="r num">{used(m.id) || "—"}</td>
                <td className="r"><button className="btn ghost icon" aria-label={"Borrar " + m.name} onClick={() => del(m.id)}><I.trash /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  ) : (
    <section className="panel">
      <h2>Tus materiales</h2>
      {st.materials.map((m) => (
        <div className="stack divided" key={m.id}>
          <div className="row end">
            <Txt id={"mn" + m.id} label="Material" value={m.name} onChange={(v) => upd(m.id, { name: v })} />
            <div className="field w130"><label htmlFor={"mc" + m.id}>Costo por uso</label><div className="inp"><span className="affix">$</span><input id={"mc" + m.id} type="text" inputMode="decimal" value={(m.cost as any) ?? ""} onChange={(e) => setCost(m, cleanNum(e.target.value))} /></div></div>
          </div>
          {plus && <div className="row end"><Num id={"mp" + m.id} label="Precio del paquete" value={m.packPrice} onChange={(v) => upd(m.id, { packPrice: v })} /><Num id={"mu" + m.id} prefix="" suffix="usos" label="Rinde para" value={m.packUses} onChange={(v) => upd(m.id, { packUses: v })} /></div>}
          <div className="row between">
            <span className="muted small">{used(m.id) ? "Lo usan " + used(m.id) + " tratamiento" + (used(m.id) > 1 ? "s" : "") : "Ningún tratamiento lo usa"}</span>
            <button className="btn ghost icon" aria-label={"Borrar " + m.name} onClick={() => del(m.id)}><I.trash /></button>
          </div>
        </div>
      ))}
    </section>
  );
  return (
    <div className="cols l">
      <div className="col">{list}</div>
      <div className="col">
        <div className="note good">Anota los precios <b>con IVA incluido</b>. Tus servicios dentales están exentos de IVA, así que el IVA que pagas en materiales no lo recuperas: es parte de tu costo.</div>
        <section className="panel">
          <h2>Agregar material</h2>
          <Txt id="newm" label="Nombre" placeholder="Ej. Ionómero de vidrio" value={nm} onChange={setNm} />
          {plus && (
            <>
              <div className="row end"><Num id="newpp" label="Precio del paquete" value={pp} onChange={setPp} /><Num id="newpu" prefix="" suffix="usos" label="Rinde para" value={pu} onChange={setPu} /></div>
              <p className="muted small">{newCost > 0 ? "Cada uso te cuesta " + money(newCost) + "." : "O escribe directo el costo por uso:"}</p>
            </>
          )}
          {!byPack && <Num id="newc" label="Costo por uso" value={nc} onChange={setNc} />}
          <button className="btn sm start" disabled={!nm.trim() || !(newCost > 0)} onClick={add}><I.plus />Guardar material</button>
        </section>
      </div>
    </div>
  );
}
