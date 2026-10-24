import { useState } from "react";
import { clinicCalc, effClinic, monthPL, treatRows } from "../../lib/calc";
import { sendFeedback } from "../../lib/cloud";
import { fmtDate, mkey, mlabel, money } from "../../lib/format";
import { can, PLANS } from "../../lib/plans";
import { Chips, I, Locked, Money, StackBar, Tag } from "../../ui/kit";
import { useApp } from "../ctx";
import { parts100 } from "../parts";
import { PATH, treatmentPath } from "../router";
import { InstallCard } from "./Comfort";
import { TreatList, TreatTable } from "./Treatlist";

const FB_KEY = "odontocostos.feedback", INSTALL_KEY = "odontocostos.install-hidden";

export function Home() {
  const { st, go, wide, cloud } = useApp();
  const plus = can(st.plan, "plus"), pro = can(st.plan, "pro");
  const cc = clinicCalc(effClinic(st)), full = clinicCalc(st.clinic), rows = treatRows(st);
  const low = rows.filter((x) => x.s === "bad" || x.s === "warn").length, mk = mkey(), pl = pro ? monthPL(st, mk) : null;
  const hidden = !plus && full.perHour - cc.perHour >= 1;
  const trialDays = cloud.ent.source === "trial" && cloud.ent.trialEndsAt ? Math.max(0, Math.ceil((new Date(cloud.ent.trialEndsAt).getTime() - Date.now()) / 864e5)) : null;
  const [installHidden, setInstallHidden] = useState(() => { try { return !!localStorage.getItem(INSTALL_KEY); } catch { return true; } });
  const hideInstall = () => { try { localStorage.setItem(INSTALL_KEY, "1"); } catch { /* sin almacenamiento */ } setInstallHidden(true); };

  return (
    <div className="screen">
      {!st.edited && (
        <section className="panel start-here">
          <div className="stack tight">
            <h2>Empieza aquí</h2>
            <p>Ahora ves un <b>consultorio de ejemplo</b>. Pon tus números en 3 pasos, como 5 minutos, y todo se recalcula solo.</p>
          </div>
          <ol className="bigsteps">
            <li><button onClick={() => go(PATH.clinic)}><span className="n">1</span><span className="t"><b>Tus gastos del mes</b><span>Renta, sueldos, luz y cuántas horas atiendes</span></span><I.chev /></button></li>
            <li><button onClick={() => go(PATH.treatments)}><span className="n">2</span><span className="t"><b>Tus tratamientos</b><span>Elige tu especialidad y ya vienen hechos; ajusta minutos y material</span></span><I.chev /></button></li>
            <li><button onClick={() => go(st.order[0] ? treatmentPath(st.order[0]) : PATH.treatments)}><span className="n">3</span><span className="t"><b>Cuánto cobrar</b><span>Tu precio mínimo y el recomendado</span></span><I.chev /></button></li>
          </ol>
        </section>
      )}
      {st.edited && cloud.mode === "live" && cloud.cfg?.accounts && !cloud.session && (
        <div className="note good row between">
          <span>{cloud.cfg.beta ? "Crea tu cuenta gratis: guardas tus datos en la nube y usas Pro sin costo durante la beta." : "Crea tu cuenta gratis: guardas tus datos en la nube y los ves en el teléfono y en la computadora."}</span>
          <button className="btn sm" onClick={() => go(PATH.account)}>Crear cuenta</button>
        </div>
      )}
      {cloud.ent.status === "trialing" && cloud.ent.trialEnd && !cloud.ent.cancelAtPeriodEnd && (
        <div className="note good row between">
          <span>Estás probando {PLANS[st.plan].name} gratis. El {fmtDate(new Date(cloud.ent.trialEnd))} se cobra tu primer {cloud.ent.interval === "year" ? "año" : "mes"}; si no quieres seguir, cancela antes.</span>
          <button className="btn sm" onClick={() => go(PATH.account)}>Ver mi cuenta</button>
        </div>
      )}
      {cloud.session && cloud.ent.trialAvailable && cloud.ent.source === "free" && st.edited && (
        <div className="note good row between">
          <span>Prueba Pro {cloud.cfg?.trialDays || 7} días gratis: estado de resultados, impuestos y cuánto te queda libre. Te avisamos antes de cobrar.</span>
          <button className="btn sm" onClick={() => go(PATH.plans)}>Ver Pro</button>
        </div>
      )}
      {trialDays !== null && (
        <div className="note good row between">
          <span>Tienes Pro gratis por {trialDays} {trialDays === 1 ? "día" : "días"} más. Después sigues en Gratis, con tus datos guardados.</span>
          <button className="btn sm" onClick={() => go(PATH.plans)}>Ver planes</button>
        </div>
      )}
      <div className="cols l">
        <div className="col">
          <section className="hero-panel">
            <p className="hero-label">Cada hora con paciente te cuesta</p>
            <Money v={cc.perHour} cls="xl" />
            <dl className="facts">
              <div><dt>Tu sueldo</dt><dd className="num">{money(cc.ownerPay)}</dd></div>
              <div><dt>Gastos al mes</dt><dd className="num">{money(cc.cashFixed + cc.depreciation)}</dd></div>
              <div><dt>Horas al mes</dt><dd className="num">{Math.round(cc.occupied)}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <div className="row between"><h2>Tus tratamientos</h2>{plus && <span className="muted small">{low ? low + " de " + rows.length + " por debajo de tu meta" : "Todos en precio sano"}</span>}</div>
            {wide ? <TreatTable rows={rows} plus={plus} /> : <TreatList rows={rows} plus={plus} />}
          </section>
        </div>
        <div className="col">
          {hidden && (
            <section className="locked">
              <div className="stack tight">
                <div className="row gap8"><h3>Te faltan costos ocultos</h3><Tag p="plus" /></div>
                <p className="muted small">Con la reposición de tu equipo, tu hora cuesta en realidad <b className="num">{money(full.perHour)}</b>, {money(full.perHour - cc.perHour)} más. Y la terminal se queda con una parte de cada cobro.</p>
                <button className="btn ghost sm start" onClick={() => go(PATH.plans)}>Ver el plan Plus</button>
              </div>
            </section>
          )}
          {pro && pl ? (
            <section className="panel">
              <div className="row between"><h2>{mlabel(mk)}</h2><Tag p="pro" /></div>
              {pl.has ? (
                <>
                  <div><p className="muted small">Te queda libre</p><Money v={pl.net} cls="lg" /></div>
                  <p className="muted small">Cobraste {money(pl.ing)}. Tu sueldo meta es {money(pl.salary)}.</p>
                  {pl.ing > 0 && pl.net > 0 && <><StackBar parts={parts100(pl)} label="A dónde se va lo que cobras" /><p className="small">De cada <b>$100</b> que cobras te quedan <b className="num">${Math.round((pl.net / pl.ing) * 100)}</b>.</p></>}
                </>
              ) : <p className="muted">Aún no registras lo que atendiste este mes.</p>}
              <button className="btn ghost sm start" onClick={() => go(PATH.finance)}>Abrir finanzas</button>
            </section>
          ) : (
            <Locked need="pro" title="¿Cuánto te queda libre cada mes?">Registra lo que atiendes y te armamos tu estado de resultados, con impuestos y lo que de verdad te llevas a casa.</Locked>
          )}
          {st.edited && !installHidden && <InstallCard onClose={hideInstall} />}
          {st.edited && <Feedback />}
        </div>
      </div>
    </div>
  );
}

function Feedback() {
  const { st, toast, cloud } = useApp();
  const [done, setDone] = useState(() => { try { return !!localStorage.getItem(FB_KEY); } catch { return true; } });
  const [ans, setAns] = useState<string>(""), [comment, setComment] = useState("");
  if (done) return null;
  const send = async () => {
    if (cloud.mode === "live") try { await sendFeedback(ans, comment, st.plan); } catch { /* se guarda solo el aviso local */ }
    try { localStorage.setItem(FB_KEY, ans); } catch { /* sin almacenamiento */ }
    setDone(true); toast("Gracias. Lo leemos todo.");
  };
  return (
    <section className="panel">
      <h2>¿Pagarías por OdontoCostos?</h2>
      <p className="muted small">Estamos definiendo el precio con dentistas como tú. Tu respuesta nos ayuda.</p>
      <Chips label="Tu respuesta" value={ans} onChange={setAns} options={[["si", "Sí, " + "$" + PLANS.pro.monthly + " al mes por Pro"], ["talvez", "Tal vez, a otro precio"], ["no", "No"]]} />
      <div className="field"><label htmlFor="fbc">¿Qué le falta para que la uses cada mes?</label><textarea id="fbc" className="area" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      <button className="btn sm start" disabled={!ans} onClick={send}>Enviar respuesta</button>
    </section>
  );
}
