// Crea en tu cuenta de Stripe todo lo que OdontoCostos necesita para cobrar:
// productos y precios (con IVA incluido), cupón de fundador, portal del cliente y webhook.
// Uso:  STRIPE_SECRET_KEY=sk_... APP_URL=https://odontocostos.com npm run stripe:setup
// Se puede correr más de una vez: lo que ya existe no se duplica.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
if (!key || !appUrl) {
  console.error("Falta STRIPE_SECRET_KEY o APP_URL.\nEjemplo: STRIPE_SECRET_KEY=sk_test_... APP_URL=https://odontocostos.com npm run stripe:setup");
  process.exit(1);
}
const stripe = new Stripe(key);

// Pesos con IVA incluido. Deben coincidir con src/lib/plans.ts.
const PLANS = [
  { id: "plus", name: "OdontoCostos Plus", desc: "Te explica cada peso de tu precio.", monthly: 99, yearly: 990 },
  { id: "pro", name: "OdontoCostos Pro", desc: "Como tener a tu contador en el bolsillo.", monthly: 199, yearly: 1990 },
];

async function product(p) {
  const found = await stripe.products.search({ query: `metadata['plan']:'${p.id}'` }).catch(() => ({ data: [] }));
  if (found.data[0]) return found.data[0];
  return stripe.products.create({ name: p.name, description: p.desc, metadata: { plan: p.id } });
}
async function price(prod, lookup, amount, interval) {
  const found = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({
    product: prod.id, currency: "mxn", unit_amount: amount * 100, lookup_key: lookup,
    recurring: { interval }, tax_behavior: "inclusive", metadata: { plan: prod.metadata.plan },
  });
}

const prices = {};
for (const p of PLANS) {
  const prod = await product(p);
  prices[p.id] = [
    await price(prod, `${p.id}_monthly`, p.monthly, "month"),
    await price(prod, `${p.id}_yearly`, p.yearly, "year"),
  ];
  console.log(`✓ ${p.name}: $${p.monthly}/mes y $${p.yearly}/año`);
}

let coupon;
try { coupon = await stripe.coupons.retrieve("FUNDADOR"); }
catch {
  coupon = await stripe.coupons.create({ id: "FUNDADOR", name: "Precio de fundador", percent_off: 50, duration: "forever", max_redemptions: 100 });
}
console.log(`✓ Cupón FUNDADOR: ${coupon.percent_off}% de por vida, ${coupon.times_redeemed}/${coupon.max_redemptions} usados`);

const portalSettings = {
  metadata: { app: "odontocostos" },
  business_profile: { headline: "OdontoCostos: administra tu suscripción", privacy_policy_url: `${appUrl}/privacidad/`, terms_of_service_url: `${appUrl}/terminos/` },
  default_return_url: `${appUrl}/app/cuenta`,
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations",
      products: PLANS.map((p) => ({ product: prices[p.id][0].product, prices: prices[p.id].map((x) => x.id) })),
    },
  },
};
const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const mine = configs.data.find((c) => c.metadata?.app === "odontocostos");
const portal = mine ? await stripe.billingPortal.configurations.update(mine.id, portalSettings) : await stripe.billingPortal.configurations.create(portalSettings);
console.log("✓ Portal del cliente");

const url = `${appUrl}/api/stripe/webhook`;
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
const EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.trial_will_end", "invoice.paid"];
let secret = "(ya existía: usa el secreto que guardaste la primera vez)";
const old = hooks.data.find((h) => h.url === url);
if (old) await stripe.webhookEndpoints.update(old.id, { enabled_events: EVENTS });
else secret = (await stripe.webhookEndpoints.create({ url, description: "OdontoCostos", enabled_events: EVENTS })).secret;
console.log("✓ Webhook " + url);

console.log(`
Copia estas variables en Render (Environment):
  STRIPE_WEBHOOK_SECRET=${secret}
  STRIPE_FOUNDER_COUPON=FUNDADOR
  STRIPE_PORTAL_CONFIG=${portal.id}
`);
