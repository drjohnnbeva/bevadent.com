import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, fetchCloudState, fetchMe, FREE_ENT, hasToken, LINK_KEY, loadConfig, saveCloudState, type Config, type Entitlement, type Session } from "../lib/cloud";
import { getSaver, type Saver } from "../lib/files";
import { loadLocal, makeDemo, normalize, saveLocal, type State } from "../lib/model";
import { can, PLANS, type PlanId } from "../lib/plans";
import { I, Logo, Tag } from "../ui/kit";
import { Ctx, useApp, type AppCtx, type Cloud, type SetState } from "./ctx";
import { navigate, parse, PATH, usePath, type Route } from "./router";
import { Account } from "./screens/Account";
import { Clinic } from "./screens/Clinic";
import { TextSizeButton, TextSizeMini } from "./screens/Comfort";
import { Finance } from "./screens/Finance";
import { Home } from "./screens/Home";
import { Plans } from "./screens/Plans";
import { GUEST_BACKUP, Backup, Learn, More, PriceList, Profile, Promos, Quotes, TOOLS } from "./screens/Tools";
import { Treatment } from "./screens/Treatment";
import { Treatments } from "./screens/Treatments";

const WIDE_Q = "(min-width: 900px)";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

function useWide() {
  const [w, setW] = useState(() => { try { return matchMedia(WIDE_Q).matches; } catch { return false; } });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = matchMedia(WIDE_Q); } catch { return; }
    const f = () => setW(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return w;
}

const TABS: [string, string, () => ReactNode, Route["name"][]][] = [
  [PATH.home, "Inicio", I.home, ["home"]],
  [PATH.clinic, "Consultorio", I.clinic, ["clinic"]],
  [PATH.treatments, "Tratamientos", I.tooth, ["treatments", "treatment"]],
  [PATH.finance, "Finanzas", I.chart, ["finance"]],
  [PATH.more, "Más", I.grid, ["more", "prices", "promos", "quotes", "learn", "profile", "plans", "backup", "account"]],
];

export function App() {
  const [st, setSt] = useState<State>(loadLocal);
  const [msg, setMsg] = useState<string | null>(null);
  const [saver, setSaver] = useState<Saver | undefined>(undefined);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [mode, setMode] = useState<Cloud["mode"]>(__PREVIEW__ ? "preview" : "loading");
  const [session, setSession] = useState<Cloud["session"]>(null);
  const [ent, setEnt] = useState<Entitlement>(FREE_ENT);
  const [sync, setSync] = useState<Cloud["sync"]>("idle");
  const wide = useWide(), path = usePath(), route = parse(path);
  const stRef = useRef(st), ready = useRef(false), skipSave = useRef(false), saveTimer = useRef<number>(0), toastTimer = useRef<number>(0);
  stRef.current = st;

  const toast = useCallback((m: string) => { setMsg(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setMsg(null), 3200); }, []);
  const set: SetState = useCallback((s, mark = true) => setSt((prev) => {
    let n = typeof s === "function" ? s(prev) : s;
    if (mark) n = { ...n, edited: true, updatedAt: Date.now() };
    saveLocal(n);
    return n;
  }), []);

  useEffect(() => { getSaver().then(setSaver); }, []);

  // Conexión con el servidor: cuentas, nube y cobro.
  useEffect(() => {
    if (__PREVIEW__) return;
    (async () => {
      const c = await loadConfig();
      if (!c) { setMode(import.meta.env.DEV ? "preview" : "live"); return; }
      setCfg(c);
      if (c.accounts && hasToken()) {
        try { const me = await fetchMe(); setSession(me.session); setEnt(me.ent); }
        catch { /* sesión vencida o sin conexión: queda como invitado con sus datos */ }
      }
      setMode("live");
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (session) setEnt((await fetchMe()).ent);
  }, [session]);
  const expired = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { setSession(null); toast("Tu sesión terminó. Entra de nuevo para seguir guardando en la nube."); }
  }, [toast]);
  const signedIn = useCallback((s: Session, e: Entitlement) => { setSession(s); setEnt(e); }, []);
  const signedOut = useCallback(() => {
    setSession(null); setSync("idle");
    store.del(LINK_KEY);
    const d = makeDemo(); saveLocal(d); setSt(d);
  }, []);

  // Al entrar: trae los datos de la cuenta, o sube los de este dispositivo si la cuenta es nueva.
  useEffect(() => {
    const uid = session?.user.id;
    ready.current = false;
    if (!uid) { setEnt(FREE_ENT); return; }
    let on = true;
    (async () => {
      try {
        const remote = await fetchCloudState();
        if (!on) return;
        const local = stRef.current, link = store.get(LINK_KEY), mine = link === uid, other = !!link && !mine;
        if (remote) {
          if (mine && (local.updatedAt || 0) > remote.updatedAt) await saveCloudState(local);
          else {
            if (!link && local.edited) store.set(GUEST_BACKUP, JSON.stringify(local));
            const n = normalize(remote.data);
            skipSave.current = true; saveLocal(n); setSt(n);
          }
        } else if (other) {
          // Lo que hay en el dispositivo es de otra cuenta: la nueva empieza con el ejemplo.
          const d = makeDemo();
          skipSave.current = true; saveLocal(d); setSt(d);
          await saveCloudState(d);
        } else await saveCloudState(local);
        store.set(LINK_KEY, uid);
        ready.current = true; setSync("saved");
      } catch (e) { if (on) { setSync("error"); expired(e); } }
    })();
    return () => { on = false; };
  }, [session?.user.id, expired]);

  // Guarda en la nube un momento después de cada cambio.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid || !ready.current) return;
    if (skipSave.current) { skipSave.current = false; return; }
    clearTimeout(saveTimer.current);
    setSync("saving");
    saveTimer.current = window.setTimeout(() => {
      saveCloudState(stRef.current).then(() => setSync("saved"), (e) => { setSync("error"); expired(e); });
    }, 1200);
  }, [st, session?.user.id, expired]);

  // Regreso del pago: el webhook puede tardar unos segundos en activar el plan.
  useEffect(() => {
    if (!session || typeof location === "undefined") return;
    const q = new URLSearchParams(location.search);
    if (q.get("pago") !== "ok") return;
    history.replaceState(null, "", location.pathname);
    toast("Pago recibido. Activando tu plan…");
    let n = 0;
    const tick = window.setInterval(async () => {
      n++;
      const e = await fetchMe().then((m) => m.ent, () => null);
      if (e && e.source === "subscription") { setEnt(e); toast("Listo: ya tienes " + PLANS[e.plan].name); clearInterval(tick); }
      else if (n >= 10) clearInterval(tick);
    }, 2500);
    return () => clearInterval(tick);
  }, [session, toast]);

  // En la vista previa, la página de venta puede abrir la app en una sección: app/index.html#planes
  useEffect(() => {
    const to: Record<string, string> = { planes: PATH.plans, cuenta: PATH.account };
    const h = location.hash.replace("#", "");
    if (to[h]) navigate(to[h], true);
  }, []);

  // Sin base de datos todavía, la beta abre Pro para todos en su dispositivo.
  const plan: PlanId = mode === "preview" ? st.plan : session ? ent.plan : cfg?.beta && !cfg.accounts ? "pro" : "free";
  const view = useMemo(() => ({ ...st, plan }), [st, plan]);
  const cloud: Cloud = { mode, cfg, session, ent, sync, refresh, signedIn, signedOut };
  const ctx: AppCtx = { st: view, set, go: navigate, toast, wide, saver, cloud };

  return (
    <Ctx.Provider value={ctx}>
      <Side route={route} />
      <main className="main">
        <div className="app">
          <header className="top">
            <a className="brand" href={import.meta.env.VITE_HOME_HREF} aria-label="OdontoCostos, página principal"><Logo size={30} /><span className="brand-name">OdontoCostos</span></a>
            <div className="row gap8 nowrap">
              <TextSizeButton />
              <button className="planbtn" onClick={() => navigate(PATH.plans)} aria-label={"Plan " + PLANS[plan].name + ". Ver planes"}>{PLANS[plan].name}<I.chev /></button>
              <button className="btn ghost sm round acct" aria-label="Tu cuenta" onClick={() => navigate(PATH.account)}><I.user /><span>Cuenta</span></button>
            </div>
          </header>
          <Screen route={route} key={route.name === "treatment" ? "t" + route.id : route.name} />
        </div>
      </main>
      <nav className="tabs" aria-label="Secciones">
        <div>
          {TABS.map(([p, l, Ico, names]) => (
            <button key={p} className="tab" aria-current={names.includes(route.name) ? "page" : undefined} onClick={() => navigate(p)}><span className="tab-ico"><Ico /></span><span className="tab-l">{l}</span></button>
          ))}
        </div>
      </nav>
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "clinic": return <Clinic />;
    case "treatments": return <Treatments />;
    case "treatment": return <Treatment id={route.id} />;
    case "finance": return <Finance />;
    case "more": return <More />;
    case "prices": return <PriceList />;
    case "promos": return <Promos />;
    case "quotes": return <Quotes />;
    case "learn": return <Learn />;
    case "profile": return <Profile />;
    case "plans": return <Plans />;
    case "backup": return <Backup />;
    case "account": return <Account />;
    default: return <Home />;
  }
}

function Side({ route }: { route: Route }) {
  const { st, cloud } = useApp();
  const cur = (names: Route["name"][]) => (names.includes(route.name) ? "page" : undefined);
  return (
    <aside className="side" aria-label="Menú">
      <a className="brand" href={import.meta.env.VITE_HOME_HREF}><Logo size={30} /><span>OdontoCostos</span></a>
      <nav className="side-nav">
        {TABS.slice(0, 4).map(([p, l, Ico, names]) => (
          <button key={p} className="side-item" aria-current={cur(names)} onClick={() => navigate(p)}><Ico /><span>{l}</span>{p === PATH.finance && !can(st.plan, "pro") && <Tag p="pro" />}</button>
        ))}
        <p className="side-group">Herramientas</p>
        {TOOLS.filter((t) => t.path !== PATH.account).map(({ path, short, need, Icon }) => (
          <button key={path} className="side-item" aria-current={cur([parse(path).name])} onClick={() => navigate(path)}><Icon /><span>{short}</span>{need && !can(st.plan, need) && <Tag p={need} />}</button>
        ))}
      </nav>
      <TextSizeMini />
      <div className="side-plan">
        {cloud.mode === "live" && cloud.session ? (
          <>
            <span className="muted small ellipsis">{cloud.session.user.email}</span>
            <div className="row between"><b>Plan {PLANS[st.plan].name}</b>{(cloud.ent.source === "trial" || cloud.ent.status === "trialing") && <span className="pill good">Prueba</span>}{cloud.ent.source === "beta" && <span className="pill good">Beta</span>}</div>
            <div className="row gap8"><button className="btn ghost sm grow" onClick={() => navigate(PATH.plans)}>Planes</button><button className="btn ghost sm grow" aria-current={cur(["account"])} onClick={() => navigate(PATH.account)}>Cuenta</button></div>
          </>
        ) : cloud.mode === "live" && cloud.cfg?.accounts ? (
          <>
            <b>Guarda tus datos en la nube</b>
            <span className="muted small">{cloud.cfg.beta ? "Crea tu cuenta y usa Pro gratis durante la beta." : "Gratis y sin tarjeta. Los ves en el teléfono y en la computadora."}</span>
            <button className="btn sm" onClick={() => navigate(PATH.account)}>Crear cuenta o entrar</button>
          </>
        ) : cloud.mode === "live" && cloud.cfg?.beta ? (
          <>
            <div className="row between"><b>Plan Pro</b><span className="pill good">Beta</span></div>
            <span className="muted small">Gratis mientras estamos en beta. Tus datos se guardan en este dispositivo.</span>
            <button className="btn ghost sm" aria-current={cur(["backup"])} onClick={() => navigate(PATH.backup)}>Respaldar mis datos</button>
          </>
        ) : (
          <>
            <span className="muted small">Vista previa</span>
            <b>Plan {PLANS[st.plan].name}</b>
            <button className="btn ghost sm" aria-current={cur(["plans"])} onClick={() => navigate(PATH.plans)}>Cambiar de plan</button>
          </>
        )}
      </div>
    </aside>
  );
}
