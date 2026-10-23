import { useState } from "react";
import { openPortal, signInWithEmail, signInWithGoogle, signOut } from "../../lib/cloud";
import { fmtDate } from "../../lib/format";
import { PLANS, TRIAL_DAYS } from "../../lib/plans";
import { Back, I, Tag, Title, Txt } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

export function Account() {
  const { st, go, toast, wide, cloud } = useApp();
  const [email, setEmail] = useState(""), [sent, setSent] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const head = <>{!wide && <Back to={PATH.more} label="Más" />}</>;

  if (cloud.mode === "preview") return (
    <div className="screen">{head}
      <Title title="Tu cuenta" lead="En esta vista previa no hay cuentas: tus datos se guardan solo en este dispositivo." />
      <section className="panel narrow"><p>En el sitio publicado entras con tu correo, tus datos se guardan en la nube y los ves en el teléfono y en la computadora. Al crear tu cuenta tienes {TRIAL_DAYS} días de Pro gratis.</p>
        <button className="btn ghost sm start" onClick={() => go(PATH.plans)}>Ver planes</button></section>
    </div>
  );
  if (cloud.mode === "loading") return <div className="screen">{head}<Title title="Tu cuenta" /><p className="muted">Conectando…</p></div>;

  if (!cloud.cfg) return (
    <div className="screen">{head}<Title title="Tu cuenta" />
      <div className="note bad">Las cuentas no están disponibles en este momento. Tus datos siguen guardados en este dispositivo; intenta de nuevo más tarde.</div></div>
  );

  if (!cloud.session) {
    const send = async (e: React.FormEvent) => {
      e.preventDefault(); setErr("");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("Escribe un correo válido, por ejemplo ana@consultorio.mx."); return; }
      setBusy(true);
      try { await signInWithEmail(email.trim()); setSent(email.trim()); }
      catch (x: any) { setErr(x?.status === 429 ? "Pediste muchos enlaces seguidos. Espera un minuto e intenta otra vez." : "No pudimos enviar el enlace. Revisa el correo e intenta de nuevo."); }
      setBusy(false);
    };
    return (
      <div className="screen">{head}
        <Title title="Entra o crea tu cuenta" lead={"Tus datos se guardan en la nube y los ves en el teléfono y en la computadora. La primera vez tienes " + TRIAL_DAYS + " días de Pro gratis, sin tarjeta."} />
        <section className="panel narrow">
          {sent ? (
            <div className="stack">
              <div className="row gap8"><I.mail /><h3>Revisa tu correo</h3></div>
              <p>Te mandamos un enlace a <b>{sent}</b>. Ábrelo en este dispositivo para entrar. Si no llega en un par de minutos, revisa la carpeta de spam.</p>
              <button className="btn ghost sm start" onClick={() => setSent("")}>Usar otro correo</button>
            </div>
          ) : (
            <form className="stack" onSubmit={send} noValidate>
              <Txt id="email" type="email" autoComplete="email" label="Tu correo" placeholder="ana@consultorio.mx" value={email} onChange={setEmail} />
              {err && <div className="note bad">{err}</div>}
              <button className="btn" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviarme el enlace para entrar"}</button>
              {cloud.cfg.google && <button className="btn ghost" type="button" onClick={() => signInWithGoogle().catch(() => toast("No se pudo abrir Google."))}>Entrar con Google</button>}
              <p className="muted small">Sin contraseñas: cada vez que entres te mandamos un enlace. Al continuar aceptas los <a href="/terminos/">términos</a> y el <a href="/privacidad/">aviso de privacidad</a>.</p>
            </form>
          )}
        </section>
      </div>
    );
  }

  const ent = cloud.ent, plan = PLANS[st.plan];
  const daysLeft = ent.trialEndsAt ? Math.max(0, Math.ceil((new Date(ent.trialEndsAt).getTime() - Date.now()) / 864e5)) : 0;
  return (
    <div className="screen">{head}
      <Title title="Tu cuenta" />
      <div className="cols l">
        <section className="panel">
          <div className="row between"><h3>{cloud.session.user.email}</h3><Tag p={st.plan} /></div>
          {ent.source === "trial" && <p>Estás probando <b>Pro</b>: te {daysLeft === 1 ? "queda 1 día" : "quedan " + daysLeft + " días"}. Después pasas a Gratis y tus datos se quedan guardados.</p>}
          {ent.source === "subscription" && <p>Tienes <b>{plan.name}</b>{ent.interval === "year" ? " anual" : " mensual"}. {ent.cancelAtPeriodEnd ? "Se cancela" : "Se renueva"} el {ent.periodEnd ? fmtDate(new Date(ent.periodEnd)) : "próximo periodo"}.{ent.status === "past_due" && " Tu último pago no pasó: actualiza tu tarjeta para no perder el plan."}</p>}
          {ent.source === "free" && <p>Estás en <b>Gratis</b>. Sube a Plus o Pro cuando quieras.</p>}
          <div className="row">
            {ent.source === "subscription"
              ? <button className="btn" onClick={() => openPortal(cloud.session!).catch((e) => toast(e.message))}><I.card />Administrar suscripción</button>
              : <button className="btn" onClick={() => go(PATH.plans)}>Ver planes</button>}
            <button className="btn ghost" onClick={async () => { await signOut(); toast("Cerraste sesión"); go(PATH.home); }}><I.logout />Cerrar sesión</button>
          </div>
        </section>
        <section className="panel">
          <div className="row gap8"><I.cloud /><h3>Tus datos</h3></div>
          <p className="small">{cloud.sync === "error" ? "No pudimos guardar en la nube. Tus cambios siguen en este dispositivo y se suben cuando vuelva la conexión." : "Se guardan en tu cuenta cada vez que cambias algo."}</p>
          {cloud.cfg.supportEmail && <p className="muted small">¿Dudas, factura o algo no funciona? Escríbenos a <b>{cloud.cfg.supportEmail}</b>.</p>}
        </section>
      </div>
    </div>
  );
}
