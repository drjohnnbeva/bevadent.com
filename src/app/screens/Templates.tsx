import { useState } from "react";
import { can, FREE_TREATS } from "../../lib/plans";
import { applySpecialty, SPECIALTIES } from "../../lib/templates";
import { I } from "../../ui/kit";
import { useApp } from "../ctx";

/** Elegir una especialidad y cargar sus tratamientos típicos, para no capturar todo desde cero. */
export function Templates({ open: startOpen = false }: { open?: boolean }) {
  const { st, set, toast } = useApp();
  const [open, setOpen] = useState(startOpen), [sel, setSel] = useState<string | null>(null);
  const plus = can(st.plan, "plus"), limit = plus ? Infinity : FREE_TREATS;
  const spec = SPECIALTIES.find((s) => s.id === sel);
  if (!open) return <button className="btn ghost auto" onClick={() => setOpen(true)}><I.grid />Cargar tratamientos de mi especialidad</button>;
  const apply = (replace: boolean) => {
    if (!spec) return;
    const r = applySpecialty(st, spec, { replace, limit });
    set(() => r.state);
    toast(r.skipped ? `Se agregaron ${r.added}. En Gratis puedes tener hasta ${FREE_TREATS} tratamientos; con Plus agregas todos.`
      : r.added ? `Listo: ${r.added} ${r.added === 1 ? "tratamiento" : "tratamientos"} de ${spec.name.toLowerCase()}. Ajusta minutos y materiales a los tuyos.`
      : "Ya tenías esos tratamientos");
    setSel(null); setOpen(false);
  };
  return (
    <section className="panel">
      <div className="row between nw"><h2>¿Cuál es tu especialidad?</h2><button className="btn quiet icon" aria-label="Cerrar" onClick={() => setOpen(false)}><I.x /></button></div>
      <p className="muted small">Te cargamos los tratamientos típicos con minutos y materiales de referencia en México. Después los ajustas a los tuyos.</p>
      <div className="specs" role="radiogroup" aria-label="Especialidad">
        {SPECIALTIES.map((s) => (
          <button key={s.id} role="radio" aria-checked={sel === s.id} className="spec" onClick={() => setSel(s.id)}>
            <b>{s.name}</b><span>{s.desc}</span>
          </button>
        ))}
      </div>
      {spec && (
        <div className="stack">
          <p className="small"><b>Se cargan:</b> {spec.list.map(([n]) => n).join(", ")}.</p>
          <div className="row">
            <button className="btn" onClick={() => apply(false)}><I.plus />Agregar a mis tratamientos</button>
            <button className="btn ghost" onClick={() => apply(true)}>Usar solo estos</button>
          </div>
          <p className="muted small">"Usar solo estos" quita los tratamientos que tienes ahora. Tus materiales se quedan.</p>
        </div>
      )}
    </section>
  );
}
