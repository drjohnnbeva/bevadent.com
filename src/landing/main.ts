// Página de venta: cambia los precios entre mensual y anual, y oculta el precio de fundador si ya se acabó.
const PRICES = {
  plus: { month: 99, year: 990, founderMonth: 49, founderYear: 495 },
  pro: { month: 199, year: 1990, founderMonth: 99, founderYear: 995 },
} as const;

let founder = true;
let interval: "month" | "year" = "month";
const fmt = (n: number) => n.toLocaleString("es-MX");

function render() {
  for (const el of document.querySelectorAll<HTMLElement>("[data-price]")) {
    const p = PRICES[el.dataset.price as keyof typeof PRICES];
    const normal = interval === "month" ? p.month : p.year;
    const now = founder ? (interval === "month" ? p.founderMonth : p.founderYear) : normal;
    const s = el.querySelector<HTMLElement>("[data-normal]")!;
    s.textContent = "$" + fmt(normal);
    s.hidden = now === normal;
    el.querySelector("[data-now]")!.textContent = fmt(now);
    el.querySelector("[data-per]")!.textContent = interval === "month" ? "al mes" : "al año";
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-founder]")) el.hidden = !founder;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-interval]")) b.setAttribute("aria-pressed", String(b.dataset.interval === interval));
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-interval]")) {
  b.addEventListener("click", () => { interval = b.dataset.interval as typeof interval; render(); });
}
render();

// En el sitio publicado, el servidor dice si quedan lugares de fundador.
if (!__PREVIEW__) {
  fetch("/api/config")
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (!c) return;
      if (typeof c.founder === "boolean") { founder = c.founder; render(); }
      if (c.beta) {
        // Beta: el cobro todavía no está activo y Pro es gratis al crear cuenta.
        const lead = document.querySelector<HTMLElement>("[data-lead]");
        if (lead) lead.textContent = "Estamos en beta: crea tu cuenta y usa Pro gratis. Antes de que empiece el cobro te avisamos, y conservas el precio de fundador.";
        for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-cta]")) { a.textContent = "Usar Pro gratis en la beta"; a.href = "/app/cuenta"; }
        const faq = document.querySelector<HTMLElement>("[data-faq-trial]");
        if (faq) faq.textContent = "Durante la beta, Pro es gratis al crear tu cuenta, sin tarjeta. Antes de que empiece el cobro te avisamos por correo, y nunca se cobra nada sin que tú contrates un plan.";
      }
    })
    .catch(() => { /* sin servidor: se queda el precio de fundador */ });
}
