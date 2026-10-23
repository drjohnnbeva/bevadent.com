import { useState } from "react";
import { changePassword, deleteAccount, lastEmail, openPortal, requestReset, resetPassword, sendSupport, signIn, signOut, signUp } from "../../lib/cloud";
import { fmtDate } from "../../lib/format";
import { PLANS, TRIAL_DAYS } from "../../lib/plans";
import { Back, Confirm, I, Seg, Tag, Title, Txt } from "../../ui/kit";
import { useApp } from "../ctx";
import { PATH } from "../router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Account() {
  const { st, go, toast, wide, cloud } = useApp();
  const head = <>{!wide && <Back to={PATH.more} label="Más" />}</>;
  const trialDays = cloud.cfg?.trialDays || TRIAL_DAYS;
  // Enlace del correo para recuperar la contraseña: /app/cuenta?reset=…
  const [resetToken, setResetToken] = useState(() => { try { return new URLSearchParams(location.search).get("reset"); } catch { return null; } });
  const [askAgain, setAskAgain] = useState(false);
  const clearReset = () => { history.replaceState(null, "", location.pathname); setResetToken(null); };

  if (cloud.mode === "preview") return (
    <div className="screen">{head}
      <Title title="Tu cuenta" lead="En esta vista previa no hay cuentas: tus datos se guardan solo en este dispositivo." />
      <section className="panel narrow"><p>En el sitio publicado entras con tu correo y una contraseña, tus datos se guardan en la nube y los ves en el teléfono y en la computadora. Al crear tu cuenta tienes {TRIAL_DAYS} días de Pro gratis.</p>
        <button className="btn ghost sm start" onClick={() => go(PATH.plans)}>Ver planes</button></section>
    </div>
  );
  if (cloud.mode === "loading") return <div className="screen">{head}<Title title="Tu cuenta" /><p className="muted">Conectando…</p></div>;

  if (!cloud.cfg) return (
    <div className="screen">{head}<Title title="Tu cuenta" />
      <div className="note bad">No pudimos conectar con el servidor. Tus datos siguen guardados en este dispositivo; intenta de nuevo más tarde.</div></div>
  );
  if (!cloud.cfg.accounts) return (
    <div className="screen">{head}
      <Title title="Tu cuenta" lead="Las cuentas se activan muy pronto." />
      <section className="panel narrow stack">
        <p>Mientras, usas <b>Pro gratis</b> y tus datos se guardan en este dispositivo. Haz un respaldo de vez en cuando; cuando abramos las cuentas, lo subes a la nube.</p>
        <button className="btn ghost sm start" onClick={() => go(PATH.backup)}><I.save />Respaldar mis datos</button>
      </section>
      <Support />
    </div>
  );

  if (resetToken) return <NewPassword token={resetToken} done={clearReset} again={() => { clearReset(); setAskAgain(true); }} />;
  if (!cloud.session) return <SignIn trialDays={trialDays} startForgot={askAgain} />;

  const ent = cloud.ent, plan = PLANS[st.plan];
  const daysLeft = ent.trialEndsAt ? Math.max(0, Math.ceil((new Date(ent.trialEndsAt).getTime() - Date.now()) / 864e5)) : 0;
  const out = async () => { await signOut(); cloud.signedOut(); toast("Cerraste sesión"); go(PATH.home); };
  return (
    <div className="screen">{head}
      <Title title="Tu cuenta" />
      <div className="cols l">
        <div className="col">
          <section className="panel">
            <div className="row between"><h3 className="ellipsis">{cloud.session.user.email}</h3><Tag p={st.plan} /></div>
            {ent.source === "beta" && <p>Estás en la <b>beta</b>: tienes Pro sin costo. Antes de que empiece el cobro te avisamos, y conservas el precio de fundador.</p>}
            {ent.source === "trial" && <p>Estás probando <b>Pro</b>: te {daysLeft === 1 ? "queda 1 día" : "quedan " + daysLeft + " días"}. Después pasas a Gratis y tus datos se quedan guardados.</p>}
            {ent.source === "subscription" && <p>Tienes <b>{plan.name}</b>{ent.interval === "year" ? " anual" : " mensual"}. {ent.cancelAtPeriodEnd ? "Se cancela" : "Se renueva"} el {ent.periodEnd ? fmtDate(new Date(ent.periodEnd)) : "próximo periodo"}.{ent.status === "past_due" && " Tu último pago no pasó: actualiza tu tarjeta para no perder el plan."}</p>}
            {ent.source === "free" && <p>Estás en <b>Gratis</b>. Sube a Plus o Pro cuando quieras.</p>}
            <div className="row">
              {ent.source === "subscription"
                ? <button className="btn" onClick={() => openPortal().catch((e) => toast(e.message))}><I.card />Administrar suscripción</button>
                : <button className="btn" onClick={() => go(PATH.plans)}>Ver planes</button>}
              <button className="btn ghost" onClick={out}><I.logout />Cerrar sesión</button>
            </div>
          </section>
          <section className="panel">
            <div className="row gap8"><I.cloud /><h3>Tus datos</h3></div>
            <p className="small">{cloud.sync === "error" ? "No pudimos guardar en la nube. Tus cambios siguen en este dispositivo y se suben cuando vuelva la conexión." : "Se guardan en tu cuenta cada vez que cambias algo."}</p>
            <button className="btn ghost sm start" onClick={() => go(PATH.backup)}><I.save />Descargar un respaldo</button>
          </section>
        </div>
        <div className="col">
          <Password />
          <Support />
          <section className="panel stack">
            <h3>Borrar mi cuenta</h3>
            <p className="muted small">Se borran tu cuenta y los datos guardados en la nube.{ent.source === "subscription" ? " Tu suscripción se cancela en ese momento." : ""} No se puede deshacer.</p>
            <Confirm label="Borrar mi cuenta" ask="Se borran tu cuenta y todos tus datos en la nube. ¿Seguro?" yes="Sí, borrar todo"
              onYes={async () => { try { await deleteAccount(); cloud.signedOut(); toast("Tu cuenta quedó borrada"); go(PATH.home); } catch (e: any) { toast(e.message); } }} />
          </section>
        </div>
      </div>
    </div>
  );
}

function SignIn({ trialDays, startForgot = false }: { trialDays: number; startForgot?: boolean }) {
  const { go, toast, wide, cloud } = useApp();
  const known = lastEmail();
  const [tab, setTab] = useState<"new" | "in">(known || startForgot ? "in" : "new"), [forgot, setForgot] = useState(startForgot);
  const [email, setEmail] = useState(known), [pw, setPw] = useState(""), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const beta = !!cloud.cfg?.beta;

  if (forgot) return <Forgot initialEmail={email} back={() => { setForgot(false); setTab("in"); }} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) { setErr("Escribe un correo válido, por ejemplo ana@consultorio.mx."); return; }
    if (tab === "new" && pw.length < 8) { setErr("La contraseña necesita al menos 8 caracteres."); return; }
    if (!pw) { setErr("Escribe tu contraseña."); return; }
    setBusy(true);
    try {
      const r = await (tab === "new" ? signUp(em, pw) : signIn(em, pw));
      cloud.signedIn(r.session, r.ent);
      toast(tab === "new" ? (beta ? "Listo: tu cuenta está creada y tienes Pro gratis" : "Listo: tienes Pro gratis por " + trialDays + " días") : "Entraste a tu cuenta");
      go(PATH.home);
    } catch (x: any) {
      setErr(x.message);
      if (x.status === 409) setTab("in");
    }
    setBusy(false);
  };
  const lead = beta
    ? "Tus datos se guardan en la nube y los ves en el teléfono y en la computadora. Durante la beta, Pro es gratis para quien crea su cuenta."
    : "Tus datos se guardan en la nube y los ves en el teléfono y en la computadora. La primera vez tienes " + trialDays + " días de Pro gratis, sin tarjeta.";
  return (
    <div className="screen">{!wide && <Back to={PATH.more} label="Más" />}
      <Title title={tab === "new" ? "Crea tu cuenta" : "Entra a tu cuenta"} lead={lead} />
      <section className="panel narrow stack">
        <Seg label="Cuenta" value={tab} onChange={(v) => { setTab(v); setErr(""); }} options={[["new", "Crear cuenta"], ["in", "Ya tengo cuenta"]]} />
        <form className="stack" onSubmit={submit} noValidate>
          <Txt id="email" type="email" autoComplete="email" label="Tu correo" placeholder="ana@consultorio.mx" value={email} onChange={setEmail} />
          <Txt id="password" type={show ? "text" : "password"} autoComplete={tab === "new" ? "new-password" : "current-password"} label="Contraseña"
            hint={tab === "new" ? "Al menos 8 caracteres. Guárdala bien: con ella entras desde cualquier dispositivo." : undefined} value={pw} onChange={setPw}
            aside={tab === "in" && <button type="button" className="linkbtn small" onClick={() => setForgot(true)}>¿Olvidaste tu contraseña?</button>} />
          <label className="row gap8 small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Mostrar contraseña</label>
          {err && <div className="note bad" role="alert">{err}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? (tab === "new" ? "Creando tu cuenta…" : "Entrando…") : tab === "new" ? "Crear mi cuenta gratis" : "Entrar"}</button>
          <p className="muted small">Al continuar aceptas los <a href="/terminos/">términos</a> y el <a href="/privacidad/">aviso de privacidad</a>.</p>
        </form>
      </section>
    </div>
  );
}

function Forgot({ initialEmail, back }: { initialEmail: string; back: () => void }) {
  const { wide, cloud } = useApp();
  const auto = !!cloud.cfg?.email;
  const [email, setEmail] = useState(initialEmail), [wa, setWa] = useState("");
  const [sent, setSent] = useState<"" | "email" | "manual">(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!EMAIL_RE.test(email.trim())) { setErr("Escribe el correo con el que creaste tu cuenta."); return; }
    setBusy(true);
    try { setSent((await requestReset(email.trim().toLowerCase(), wa.trim())).via); }
    catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div className="screen">{!wide && <Back to={PATH.more} label="Más" />}
      <Title title="Recupera tu cuenta" lead={auto ? "Te mandamos un enlace a tu correo para que pongas una contraseña nueva. Tus datos siguen guardados." : "Déjanos tu correo y te ayudamos a entrar. Tus datos siguen guardados."} />
      <section className="panel narrow stack">
        {sent === "email" ? (
          <div className="stack">
            <div className="row gap8"><I.mail /><h3>Revisa tu correo</h3></div>
            <p>Si hay una cuenta con <b>{email.trim()}</b>, te llega un enlace en un minuto. Sirve una sola vez durante una hora. Si no lo ves, busca en spam o en Promociones.</p>
          </div>
        ) : sent === "manual" ? (
          <div className="stack">
            <div className="row gap8"><I.check /><h3>Recibimos tu solicitud</h3></div>
            <p>Te mandamos una contraseña temporal {wa.trim() ? "por WhatsApp o " : "a "}tu correo, normalmente el mismo día. Al entrar, cámbiala en Cuenta.</p>
          </div>
        ) : (
          <form className="stack" onSubmit={send} noValidate>
            <Txt id="femail" type="email" autoComplete="email" label="Tu correo" placeholder="ana@consultorio.mx" value={email} onChange={setEmail} />
            {!auto && <Txt id="fwa" type="tel" autoComplete="tel" label="Tu WhatsApp (opcional)" placeholder="443 123 4567" hint="Para mandarte la contraseña temporal más rápido." value={wa} onChange={setWa} />}
            {err && <div className="note bad" role="alert">{err}</div>}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Enviando…" : auto ? "Mandarme el enlace" : "Pedir ayuda para entrar"}</button>
          </form>
        )}
        <button className="btn quiet sm start" onClick={back}><I.back />Volver a entrar</button>
      </section>
    </div>
  );
}

function NewPassword({ token, done, again }: { token: string; done: () => void; again: () => void }) {
  const { go, toast, wide, cloud } = useApp();
  const [pw, setPw] = useState(""), [show, setShow] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (pw.length < 8) { setErr("La contraseña necesita al menos 8 caracteres."); return; }
    setBusy(true);
    try {
      const r = await resetPassword(token, pw);
      cloud.signedIn(r.session, r.ent);
      done(); toast("Listo: cambiaste tu contraseña y ya entraste"); go(PATH.home);
    } catch (x: any) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="screen">{!wide && <Back to={PATH.more} label="Más" />}
      <Title title="Pon tu contraseña nueva" lead="Con ella entras desde el teléfono y la computadora. Tus datos siguen guardados." />
      <section className="panel narrow">
        <form className="stack" onSubmit={save} noValidate>
          <Txt id="newpw" type={show ? "text" : "password"} autoComplete="new-password" label="Contraseña nueva" hint="Al menos 8 caracteres." value={pw} onChange={setPw} />
          <label className="row gap8 small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Mostrar contraseña</label>
          {err && <div className="note bad" role="alert">{err}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
          {err && <button type="button" className="btn quiet sm start" onClick={again}>Pedir otro enlace</button>}
        </form>
      </section>
    </div>
  );
}

function Password() {
  const { toast, cloud } = useApp();
  const [open, setOpen] = useState(false), [cur, setCur] = useState(""), [next, setNext] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const forgot = async () => {
    try {
      const r = await requestReset(cloud.session!.user.email);
      toast(r.via === "email" ? "Te mandamos un enlace a tu correo para poner una contraseña nueva" : "Recibimos tu solicitud: te ayudamos por correo");
      setOpen(false);
    } catch (x: any) { setErr(x.message); }
  };
  if (!open) return <section className="panel"><h3>Contraseña</h3><button className="btn ghost sm start" onClick={() => setOpen(true)}><I.lock />Cambiar mi contraseña</button></section>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (next.length < 8) { setErr("La contraseña nueva necesita al menos 8 caracteres."); return; }
    setBusy(true);
    try { await changePassword(cur, next); toast("Contraseña cambiada. Cerramos tu sesión en los demás dispositivos."); setOpen(false); setCur(""); setNext(""); }
    catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <section className="panel">
      <h3>Cambiar contraseña</h3>
      <form className="stack" onSubmit={save} noValidate>
        <Txt id="pwcur" type="password" autoComplete="current-password" label="Contraseña actual" value={cur} onChange={setCur} />
        <Txt id="pwnew" type="password" autoComplete="new-password" label="Contraseña nueva" hint="Al menos 8 caracteres." value={next} onChange={setNext} />
        {err && <div className="note bad" role="alert">{err}</div>}
        <div className="row"><button className="btn sm" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button><button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>Cancelar</button></div>
        <button className="btn quiet sm start" type="button" onClick={forgot}>No recuerdo mi contraseña actual</button>
      </form>
    </section>
  );
}

function Support({ initialEmail = "", initialMessage = "", title = "¿Dudas o algo no funciona?", lead = "Escríbenos. Lo lee un dentista de carne y hueso." }: { initialEmail?: string; initialMessage?: string; title?: string; lead?: string }) {
  const { cloud } = useApp();
  const [email, setEmail] = useState(cloud.session?.user.email || initialEmail), [msg, setMsg] = useState(initialMessage);
  const [sent, setSent] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!EMAIL_RE.test(email.trim())) { setErr("Escribe el correo donde quieres que te respondamos."); return; }
    if (msg.trim().length < 3) { setErr("Escribe tu mensaje."); return; }
    setBusy(true);
    try { await sendSupport(email.trim(), msg.trim()); setSent(true); }
    catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <section className="panel narrow">
      <div className="row gap8"><I.mail /><h3>{title}</h3></div>
      {sent ? <p>Recibimos tu mensaje. Te respondemos a <b>{email.trim()}</b>.</p> : (
        <form className="stack" onSubmit={send} noValidate>
          <p className="muted small">{lead}</p>
          {!cloud.session && <Txt id="semail" type="email" autoComplete="email" label="Tu correo" placeholder="ana@consultorio.mx" value={email} onChange={setEmail} />}
          <div className="field"><label htmlFor="smsg">Tu mensaje</label><textarea id="smsg" className="area" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Puedes dejar también tu WhatsApp" /></div>
          {err && <div className="note bad" role="alert">{err}</div>}
          <button className="btn ghost sm start" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar mensaje"}</button>
          {cloud.cfg?.supportEmail && <p className="muted small">O escribe a <b>{cloud.cfg.supportEmail}</b>.</p>}
        </form>
      )}
    </section>
  );
}
