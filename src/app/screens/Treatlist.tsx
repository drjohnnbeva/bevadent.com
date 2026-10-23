import type { TreatRow } from "../../lib/calc";
import { N, money } from "../../lib/format";
import { I, Pill } from "../../ui/kit";
import { useApp } from "../ctx";
import { treatmentPath } from "../router";

/** Tratamientos como lista (teléfono) o tabla (computadora). */
export function TreatList({ rows, plus, minutes }: { rows: TreatRow[]; plus: boolean; minutes?: boolean }) {
  const { go } = useApp();
  return (
    <div className="rows">
      {rows.map((x) => (
        <button className="lrow" key={x.id} onClick={() => go(treatmentPath(x.id))}>
          <span className="main">
            <span className="name">{x.t.name}</span>
            <span className="muted small">{minutes && <><span className="num">{N(x.t.minutes)}</span> min, </>}te cuesta <span className="num">{money(x.r.cost)}</span></span>
          </span>
          <span className="end">
            <span className="num strong">{money(x.price)}</span>
            {plus && x.s ? <Pill s={x.s} /> : <span className="muted small">recomendado</span>}
          </span>
          <I.chev />
        </button>
      ))}
    </div>
  );
}
export function TreatTable({ rows, plus, full }: { rows: TreatRow[]; plus: boolean; full?: boolean }) {
  const { go } = useApp();
  const open = (id: string) => go(treatmentPath(id));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Tratamiento</th>{full && <th className="r">Minutos</th>}<th className="r">Te cuesta</th>{full && <th className="r">Mínimo</th>}
            <th className="r">Recomendado</th>{plus && <th className="r">Tu precio</th>}{plus && <th>Estado</th>}<th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className="click" onClick={() => open(x.id)}>
              <td><button className="linkbtn" onClick={(e) => { e.stopPropagation(); open(x.id); }}>{x.t.name}</button></td>
              {full && <td className="r num">{N(x.t.minutes)}</td>}
              <td className="r num">{money(x.r.cost)}</td>
              {full && <td className="r num">{money(x.r.minPrice)}</td>}
              <td className="r num">{money(x.r.recPrice)}</td>
              {plus && <td className="r num strong">{x.own ? money(N(x.t.price)) : "—"}</td>}
              {plus && <td>{x.s && <Pill s={x.s} />}</td>}
              <td className="r muted"><I.chev /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
