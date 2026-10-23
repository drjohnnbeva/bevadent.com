import { useState } from "react";
import { openPortal, startCheckout } from "../../lib/cloud";
import { fmtDate } from "../../lib/format";
import { PLAN_ORDER, PLANS, TRIAL_DAYS, type Interval, type PlanId } from "../../lib/plans";
import { Back, I, Seg, Title } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

const price = (id: PlanId, interval: Interval, founder: boolean) => {
  const p = PLANS[id];
  const normal = interval === "month" ? p.monthly : p.yearly;
  const now = founder && p.founderMonthly ? (interval === "month" ? p.founderMonthly : Math.round(p.yearly / 2)) : normal;
  return { normal, now };
};

export function Plans() {
  const { st, set, toast, wide, go, cloud } = useApp();
  const [interval, setInterval] = useState<Interval>("month"), [busy, setBusy] = useState<PlanId | null>(null);
  const live = cloud.mode === "live", founder = live ? !!cloud.cfg?.founder : true, ent = cloud.ent;
  const current: PlanId = st.plan, subscribed = ent.source === "subscription";

  const act = async (id: PlanId) => {
    if (!live) { set((s) => ({ ...s, plan: id }), false); toast("Plan " + PLANS[id].name + " activado en la vista previa"); return; }
    if (!cloud.session) { go(PATH.account); return; }
    setBusy(id);
    try {
      if (subscribed) await openPortal(cloud.session);
      else if (id !== "free") await startCheckout(cloud.session, id, interval);
    } catch (e: any) { toast(e?.message || "No se pudo abrir el pago."); setBusy(null); }
  };
  const label = (id: PlanId) => {
    if (PLANS[id].rank < PLANS[current].rank) return live && !cloud.session ? "Empezar gratis" : "Cambiar a " + PLANS[id].name;
    if (!live) return "Probar " + PLANS[id].name;
    if (!cloud.session) return id === "free" ? "Empezar gratis" : "Crear cuenta y probar " + TRIAL_DAYS + " días";
    if (subscribed) return "Cambiar en mi suscripción";
    return "Suscribirme a " + PLANS[id].name;
  };
  return (
    <div className="screen">
      {!wide && <Back to={PATH.more} label="Más" />}
      <Title title="Elige cuánto quieres saber de tus números" lead={"Empieza gratis. Al crear tu cuenta tienes " + TRIAL_DAYS + " días de Pro sin tarjeta; después decides."} />
      {!live && <div className="note plain">Vista previa: aquí puedes probar cualquier plan sin pagar. En el sitio publicado se cobra con tarjeta.</div>}
      {live && ent.source === "trial" && ent.trialEndsAt && <div className="note good">Estás probando Pro hasta el {fmtDate(new Date(ent.trialEndsAt))}.</div>}
      {live && subscribed && <div className="note good">Tienes {PLANS[current].name}{ent.interval === "year" ? " anual" : " mensual"}. {ent.cancelAtPeriodEnd ? "Se cancela" : "Se renueva"} el {ent.periodEnd ? fmtDate(new Date(ent.periodEnd)) : "próximo periodo"}.</div>}
      <div className="row between">
        <div className="seg-wrap small-seg"><Seg label="Periodo" value={interval} onChange={setInterval} options={[["month", "Mensual"], ["year", "Anual: 2 meses gratis"]]} /></div>
        {founder && <span className="founder-badge">Precio de fundador para los primeros 100 dentistas, de por vida</span>}
      </div>
      <div className="g3 plans">
        {PLAN_ORDER.map((id) => {
          // Durante la prueba, Pro no es "tu plan": se puede contratar.
          const p = PLANS[id], pr = price(id, interval, founder);
          const cur = !live ? current === id : subscribed ? current === id : id === "free" && ent.source === "free";
          const onTrial = live && ent.source === "trial" && id === "pro";
          return (
            <section key={id} className={"plan" + (id === "pro" ? " featured" : "") + (cur ? " cur" : "")}>
              <div className="row between"><h2>{p.name}</h2>{cur && <span className="pill good"><I.check />Tu plan</span>}{onTrial && <span className="pill good">En prueba</span>}</div>
              <p className="muted">{p.tag}</p>
              <div className="plan-price">
                {pr.now !== pr.normal && <s className="muted num">${pr.normal.toLocaleString("es-MX")}</s>}
                <span className="money lg"><span className="cur">$</span>{pr.now.toLocaleString("es-MX")}</span>
                <span className="muted small">{p.monthly ? (interval === "month" ? "al mes" : "al año") : "para siempre"}</span>
              </div>
              <ul className="feats">{p.feats.map((f) => <li key={f}><I.check />{f}</li>)}</ul>
              {!cur && !(live && id === "free" && !!cloud.session) && (
                <button className={"btn" + (id === "pro" ? "" : " ghost")} disabled={busy !== null || (live && !cloud.cfg?.billing && !!cloud.session)} onClick={() => act(id)}>
                  {busy === id ? "Abriendo el pago…" : label(id)}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="muted small">Precios en pesos mexicanos con IVA incluido. Cancela cuando quieras desde tu cuenta; conservas tus datos y regresas a Gratis. {cloud.cfg?.supportEmail ? "¿Necesitas factura? Escríbenos a " + cloud.cfg.supportEmail + "." : ""}</p>
    </div>
  );
}
