import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../app/ctx";
import { PATH } from "../app/router";
import type { Status } from "../lib/calc";
import { copyText, saveFile } from "../lib/files";
import { N, money } from "../lib/format";
import { PLANS, type PlanId } from "../lib/plans";

/* ---------- Íconos (trazo de 1.8, en el color del texto) ---------- */
const ic = (d: ReactNode) => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const I = {
  home: ic(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />),
  clinic: ic(<path d="M3 21h18M5 21V8l7-5 7 5v13M10 13h4M12 11v4" />),
  tooth: ic(<path d="M7 3c-2 0-3.5 1.6-3.5 4 0 3 1.5 4 2 7 .4 2.5.8 7 2.5 7 1.4 0 1.5-4 4-4s2.6 4 4 4c1.7 0 2.1-4.5 2.5-7 .5-3 2-4 2-7 0-2.4-1.5-4-3.5-4-2 0-3 1-5 1S9 3 7 3z" />),
  chart: ic(<path d="M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4" />),
  grid: ic(<><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>),
  lock: ic(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  back: ic(<path d="M15 18l-6-6 6-6" />),
  chev: ic(<path d="M9 18l6-6-6-6" />),
  share: ic(<><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8" /></>),
  dots: ic(<><circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></>),
  plusSq: ic(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>),
  phone: ic(<><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>),
  chat: ic(<path d="M4 20l1.4-4A8 8 0 1 1 8 18.6z" />),
  plus: ic(<path d="M12 5v14M5 12h14" />),
  minus: ic(<path d="M5 12h14" />),
  x: ic(<path d="M6 6l12 12M18 6L6 18" />),
  check: ic(<path d="M5 12l5 5L20 7" />),
  alert: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>),
  down: ic(<path d="M12 5v14M6 13l6 6 6-6" />),
  file: ic(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  copy: ic(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>),
  trash: ic(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />),
  upload: ic(<path d="M12 21V9M7 14l5-5 5 5M5 3h14" />),
  save: ic(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />),
  list: ic(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />),
  percent: ic(<><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>),
  clip: ic(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>),
  learn: ic(<><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>),
  user: ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>),
  star: ic(<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />),
  cloud: ic(<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" />),
  mail: ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  card: ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>),
  logout: ic(<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />),
};

/** Logotipo: muela dentro de un cuadro verde quirúrgico. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="9" fill="var(--scrub)" />
      <path d="M11 7.5c-2.4 0-4 1.8-4 4.4 0 3.2 1.6 4.4 2.1 7.6.5 2.8.9 5.5 2.7 5.5 1.5 0 1.6-3.9 4.2-3.9s2.7 3.9 4.2 3.9c1.8 0 2.2-2.7 2.7-5.5.5-3.2 2.1-4.4 2.1-7.6 0-2.6-1.6-4.4-4-4.4-2.1 0-3.1 1-5 1s-2.9-1-5-1z" fill="none" stroke="var(--scrub-ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="24.5" cy="8" r="2.6" fill="var(--gum)" />
    </svg>
  );
}

/** Monto grande: el signo de pesos va más chico y arriba, como en un ticket. */
export function Money({ v, cls = "" }: { v: number; cls?: string }) {
  if (!Number.isFinite(v)) return <span className={"money " + cls}>—</span>;
  const r = Math.round(Math.abs(v)), neg = v < 0 && r > 0;
  return (
    <span className={"money " + cls + (neg ? " neg" : "")}>
      {neg && <span className="sign">−</span>}<span className="cur">$</span>{r.toLocaleString("es-MX")}
    </span>
  );
}

/** Lo que se escribe en un campo de cantidad: sin comas ni letras ("12,000" → "12000"). */
export const cleanNum = (v: string) => {
  const t = v.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const neg = t.startsWith("-"), body = t.replace(/-/g, "");
  const [i, ...d] = body.split(".");
  return (neg ? "-" : "") + i + (d.length ? "." + d.join("") : "");
};
/** Cantidades largas con comas para leerlas fácil: 142200 → 142,200. */
export const groupNum = (v: string) => {
  const m = /^(-?)(\d+)(\.\d*)?$/.exec(v);
  return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (m[3] || "") : v;
};
// Campo de texto con teclado numérico (no type="number": en la computadora la rueda del mouse cambiaba la cifra sin querer).
// Las comas se quedan mientras escribe; el cursor se acomoda para que no brinque al final.
export function Num(p: { id: string; label: string; hint?: ReactNode; value: unknown; onChange: (v: string) => void; prefix?: string; suffix?: string; disabled?: boolean; step?: string }) {
  const prefix = p.prefix ?? "$";
  const ref = useRef<HTMLInputElement>(null), caretDigits = useRef<number | null>(null);
  const raw = p.value === null || p.value === undefined ? "" : String(p.value);
  // Después de cada cambio, el cursor vuelve a quedar detrás de la misma cifra.
  useLayoutEffect(() => {
    const box = ref.current, before = caretDigits.current;
    caretDigits.current = null;
    if (!box || before === null || document.activeElement !== box) return;
    let i = 0;
    for (let n = 0; i < box.value.length && n < before; i++) if (box.value[i] !== ",") n++;
    box.setSelectionRange(i, i);
  });
  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target, caret = el.selectionStart ?? el.value.length;
    caretDigits.current = cleanNum(el.value.slice(0, caret)).length;
    p.onChange(cleanNum(el.value));
  };
  return (
    <div className="field">
      <label htmlFor={p.id}>{p.label}</label>
      <div className="inp">
        {prefix && <span className="affix">{prefix}</span>}
        <input ref={ref} id={p.id} inputMode="decimal" type="text" autoComplete="off" enterKeyHint="done" value={groupNum(raw)} disabled={p.disabled} onChange={change} />
        {p.suffix && <span className="affix">{p.suffix}</span>}
      </div>
      {p.hint && <small>{p.hint}</small>}
    </div>
  );
}
export function Txt(p: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; type?: string; autoComplete?: string; aside?: ReactNode }) {
  return (
    <div className="field">
      {p.aside ? <div className="field-head"><label htmlFor={p.id}>{p.label}</label>{p.aside}</div> : <label htmlFor={p.id}>{p.label}</label>}
      <div className="inp"><input id={p.id} className="txt" type={p.type || "text"} autoComplete={p.autoComplete} value={p.value ?? ""} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} /></div>
      {p.hint && <small>{p.hint}</small>}
    </div>
  );
}
export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} className="chip" aria-pressed={String(value) === String(k)} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
const STATUS: Record<Status, [string, () => ReactNode]> = { good: ["Precio sano", I.check], warn: ["Ganancia baja", I.alert], bad: ["Pierdes dinero", I.down], none: ["Sin precio", I.minus] };
export function Pill({ s }: { s: Status }) {
  const [label, Ico] = STATUS[s];
  return <span className={"pill " + s}><Ico />{label}</span>;
}
export const Tag = ({ p }: { p: PlanId }) => <span className={"tag " + p}>{PLANS[p].name}</span>;

export function Title({ title, lead, step, children }: { title: string; lead?: ReactNode; step?: string; children?: ReactNode }) {
  return (
    <header className="title">
      {step && <p className="step">{step}</p>}
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      {children}
    </header>
  );
}
export function Back({ to, label }: { to: string; label: string }) {
  const { go } = useApp();
  return <button className="btn quiet sm back" onClick={() => go(to)}><I.back />{label}</button>;
}
export function Locked({ need, title, children }: { need: PlanId; title: string; children: ReactNode }) {
  const { go } = useApp();
  return (
    <section className="locked">
      <div className="lk"><I.lock /></div>
      <div className="stack tight">
        <div className="row gap8"><h3>{title}</h3><Tag p={need} /></div>
        <p className="muted small">{children}</p>
        <button className="btn ghost sm start" onClick={() => go(PATH.plans)}>Ver el plan {PLANS[need].name}</button>
      </div>
    </section>
  );
}
export interface Part { label: string; value: number; color: string }
export function StackBar({ parts, label }: { parts: Part[]; label: string }) {
  const t = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <div className="sbar" role="img" aria-label={label}>
      {t > 0 && parts.filter((p) => p.value > 0).map((p, i) => <i key={i} style={{ flexBasis: (p.value / t) * 100 + "%", background: p.color }} />)}
    </div>
  );
}
export function Legend({ parts }: { parts: Part[] }) {
  const t = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <div className="legend">
      {parts.map((p, i) => (
        <div className="kv" key={i}>
          <span className="row gap8 nw"><i className="sw" style={{ background: p.color }} /><span>{p.label}</span></span>
          <span><span className="num">{money(p.value)}</span>{t > 0 && p.value > 0 && <span className="muted small"> {Math.round((p.value / t) * 100)}%</span>}</span>
        </div>
      ))}
    </div>
  );
}
export function Stepper({ value, onChange, label }: { value: unknown; onChange: (v: string | number) => void; label: string }) {
  const v = N(value);
  return (
    <div className="stepper">
      <button className="btn ghost icon" aria-label={"Uno menos de " + label} onClick={() => onChange(Math.max(0, v - 1))}><I.minus /></button>
      <input aria-label={"Cantidad de " + label} type="text" inputMode="numeric" value={(value as any) ?? ""} onChange={(e) => onChange(cleanNum(e.target.value))} />
      <button className="btn ghost icon" aria-label={"Uno más de " + label} onClick={() => onChange(v + 1)}><I.plus /></button>
    </div>
  );
}
export function Confirm({ label, ask, yes, onYes }: { label: string; ask: string; yes: string; onYes: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn quiet sm start danger-text" onClick={() => setOpen(true)}><I.trash />{label}</button>;
  return (
    <div className="note bad stack">
      <span>{ask}</span>
      <div className="row"><button className="btn danger sm" onClick={() => { setOpen(false); onYes(); }}>{yes}</button><button className="btn ghost sm" onClick={() => setOpen(false)}>Cancelar</button></div>
    </div>
  );
}
export function CopyBtn({ text, label }: { text: string; label?: string }) {
  const { toast } = useApp();
  const [show, setShow] = useState(false), ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (show && ref.current) { ref.current.focus(); ref.current.select(); } }, [show]);
  return (
    <div className="stack">
      <button className="btn ghost" onClick={async () => { if (await copyText(text)) toast("Copiado. Pégalo en WhatsApp o donde quieras."); else setShow(true); }}><I.copy />{label || "Copiar texto"}</button>
      {show && <><textarea ref={ref} className="copybox" readOnly value={text} aria-label="Texto para copiar" /><small className="muted">Selecciona todo el texto y cópialo.</small></>}
    </div>
  );
}
export function FileBtn({ label, name, make, cls = "" }: { label: string; name: string; make: () => Promise<Blob | string>; cls?: string }) {
  const { saver, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (saver === undefined) return null;
  if (!saver) return <p className="muted small">Aquí no se pueden descargar archivos. Usa el botón de copiar texto.</p>;
  return (
    <button className={"btn " + cls} disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await saveFile(saver, name, await make());
        if (r === "saved") toast("Archivo listo"); else if (r !== "declined") toast("No se pudo guardar el archivo aquí.");
      } catch { toast("No se pudo crear el PDF. Intenta de nuevo."); }
      setBusy(false);
    }}><I.file />{busy ? "Preparando…" : label}</button>
  );
}
/** Número de WhatsApp para wa.me: 10 dígitos de México llevan 52 adelante. */
export const waPhone = (p = "") => { const d = p.replace(/\D/g, ""); return d.length === 10 ? "52" + d : d; };
export const waLink = (text: string, phone = "") => "https://wa.me/" + waPhone(phone) + "?text=" + encodeURIComponent(text);

/**
 * Mandar por WhatsApp. En el teléfono abre el menú de compartir con el PDF (se elige WhatsApp y el contacto);
 * en la computadora, o si hay teléfono del paciente, abre WhatsApp con el texto listo.
 * El PDF se prepara antes del toque: Safari solo deja compartir justo después de tocar.
 */
export function WhatsAppBtn({ text, name, make, phone = "", label = "Mandar por WhatsApp", cls = "" }: { text: string; name?: string; make?: () => Promise<Blob>; phone?: string; label?: string; cls?: string }) {
  const { toast } = useApp();
  const direct = waPhone(phone).length >= 12;
  // El PDF se comparte solo en teléfono y tableta; en la computadora se abre WhatsApp Web con el texto.
  const canFiles = !!make && !direct && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && matchMedia("(pointer: coarse)").matches;
  const [file, setFile] = useState<File | null>(null), [failed, setFailed] = useState(false);
  const makeRef = useRef(make); makeRef.current = make;
  useEffect(() => {
    if (!canFiles) return;
    let on = true;
    const t = setTimeout(async () => {
      try { const b = await makeRef.current!(); if (on) setFile(new File([b], name || "archivo.pdf", { type: "application/pdf" })); } catch { if (on) setFailed(true); }
    }, 500);
    return () => { on = false; clearTimeout(t); };
  }, [canFiles, text, name]);
  const send = async () => {
    if (canFiles && file && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; }
      catch (e: any) { if (e?.name === "AbortError") return; }
    }
    if (canFiles && !file && !failed) { toast("Preparando el PDF… toca otra vez en un momento."); return; }
    window.open(waLink(text, phone), "_blank", "noopener");
  };
  return <button className={"btn wa " + cls} onClick={send}><I.chat />{direct ? label + " al paciente" : label}</button>;
}
export function KV({ label, value, cls = "", neg }: { label: ReactNode; value: number; cls?: string; neg?: boolean }) {
  return (
    <div className={"kv " + cls}>
      <span>{label}</span>
      <span className={"num" + (!neg && value < 0 ? " neg" : "")}>{neg && value > 0 ? "−" + money(value) : money(value)}</span>
    </div>
  );
}
/** Resumen flotante del teléfono: el número que importa siempre a la vista mientras capturas. */
export function Peek({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label?: string }) {
  return (
    <>
      <div className="peek">{onClick ? <button aria-label={label} onClick={onClick}>{children}</button> : <div>{children}</div>}</div>
      <div className="peek-space" aria-hidden="true" />
    </>
  );
}
export const Note = ({ kind = "", children }: { kind?: "" | "bad" | "good" | "plain"; children: ReactNode }) => <div className={"note " + kind}>{children}</div>;
