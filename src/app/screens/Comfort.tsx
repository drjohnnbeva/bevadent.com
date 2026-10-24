import { useEffect, useState } from "react";
import { canPromptInstall, getTextSize, onInstallChange, platform, promptInstall, setTextSize, TEXT_SIZES, type TextSize } from "../../lib/prefs";
import { I } from "../../ui/kit";
import { useApp } from "../ctx";

function useTextSize() {
  const [v, setV] = useState<TextSize>(getTextSize);
  const choose = (x: TextSize) => { setTextSize(x); setV(x); };
  return [v, choose] as const;
}

/** Tamaño de letra con la muestra de cada opción (pantalla Más). */
export function TextSizePicker() {
  const [v, choose] = useTextSize();
  return (
    <section className="panel">
      <h2>Tamaño de letra</h2>
      <p className="muted small">Elige con cuál lees mejor. Se guarda en este dispositivo.</p>
      <div className="sizes" role="radiogroup" aria-label="Tamaño de letra">
        {TEXT_SIZES.map(([k, l], i) => (
          <button key={k} role="radio" aria-checked={v === k} className="size-opt" onClick={() => choose(k)}>
            <span className="size-a" style={{ fontSize: 20 + i * 5 + "px" }} aria-hidden="true">Aa</span>{l}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Versión corta para el menú lateral de la computadora. */
export function TextSizeMini() {
  const [v, choose] = useTextSize();
  return (
    <div className="size-mini">
      <span className="small muted">Letra</span>
      <div className="size-mini-opts" role="radiogroup" aria-label="Tamaño de letra">
        {TEXT_SIZES.map(([k, l], i) => (
          <button key={k} role="radio" aria-checked={v === k} aria-label={l} title={l} onClick={() => choose(k)} style={{ fontSize: 14 + i * 3 + "px" }}>A</button>
        ))}
      </div>
    </div>
  );
}

/** Botón "Aa" de la barra del teléfono: cada toque agranda la letra. */
export function TextSizeButton() {
  const { toast } = useApp();
  const [v, choose] = useTextSize();
  const next = () => {
    const i = TEXT_SIZES.findIndex(([k]) => k === v), [k, l] = TEXT_SIZES[(i + 1) % TEXT_SIZES.length];
    choose(k);
    toast(k === "xl" ? "Letra muy grande. Tócalo otra vez para regresar a normal." : k === "lg" ? "Letra grande. Tócalo otra vez para agrandarla más." : "Letra " + l.toLowerCase());
  };
  return <button className="btn ghost icon round aa" aria-label="Tamaño de letra" onClick={next}>Aa</button>;
}

/** Instrucciones para tener OdontoCostos en la pantalla del teléfono o la computadora, según el navegador. */
export function InstallCard({ onClose }: { onClose?: () => void }) {
  const { toast } = useApp();
  const [p] = useState(platform);
  const [can, setCan] = useState(canPromptInstall);
  useEffect(() => onInstallChange(() => setCan(canPromptInstall())), []);
  if (p.standalone) return null;
  const install = async () => { if (await promptInstall()) toast("Listo: OdontoCostos ya está en tu pantalla"); };
  return (
    <section className="panel install">
      <div className="row between nw">
        <div className="row gap8 nw"><I.phone /><h2>Tenla como app en tu {p.ios || p.android ? "teléfono" : "computadora"}</h2></div>
        {onClose && <button className="btn quiet icon" aria-label="Cerrar" onClick={onClose}><I.x /></button>}
      </div>
      <p className="muted small">Un ícono en tu pantalla para abrirla con un toque, sin buscarla en el navegador.</p>
      {can ? (
        <button className="btn start" onClick={install}><I.plusSq />Instalar OdontoCostos</button>
      ) : p.inApp ? (
        <p>Abriste el enlace desde otra app. Toca <b>⋯</b> o el ícono del navegador y elige <b>Abrir en {p.ios ? "Safari" : "Chrome"}</b>; ahí te decimos cómo instalarla.</p>
      ) : p.ios ? (
        <ol className="how">
          <li><span className="how-ico"><I.share /></span><span>Toca <b>Compartir</b>{" "}<span className="muted">(abajo en el iPhone, arriba en el iPad)</span>.</span></li>
          <li><span className="how-ico"><I.plusSq /></span><span>Busca y toca <b>Agregar a inicio</b>. Si no lo ves, desliza hacia arriba.</span></li>
          <li><span className="how-ico"><I.check /></span><span>Toca <b>Agregar</b>. Listo: aparece el ícono verde de OdontoCostos.</span></li>
        </ol>
      ) : p.android ? (
        <ol className="how">
          <li><span className="how-ico"><I.dots /></span><span>Toca el menú <b>⋮</b> arriba a la derecha.</span></li>
          <li><span className="how-ico"><I.plusSq /></span><span>Elige <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</span></li>
          <li><span className="how-ico"><I.check /></span><span>Toca <b>Instalar</b>. Listo: aparece el ícono verde de OdontoCostos.</span></li>
        </ol>
      ) : p.macSafari ? (
        <p>En Safari, abre el menú <b>Archivo</b> y elige <b>Agregar al Dock</b>.</p>
      ) : (
        <p>En Chrome o Edge, toca el ícono de <b>instalar</b> a la derecha de la barra de direcciones, o abre el menú <b>⋮</b> y elige <b>Instalar OdontoCostos</b>.</p>
      )}
    </section>
  );
}
