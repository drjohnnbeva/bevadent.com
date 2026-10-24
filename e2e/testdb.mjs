// Postgres en memoria (PGlite) para las pruebas: mismo SQL que en producción, sin instalar nada.
import { PGlite } from "@electric-sql/pglite";
import { createApp, SCHEMA } from "../server/app.mjs";

export async function testDb() {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  return { query: (text, params) => pg.query(text, params), exec: (sql) => pg.exec(sql), close: () => pg.close() };
}

/** Levanta la app en un puerto libre. Regresa { base, close }. */
export async function serve(opts) {
  const app = createApp(opts);
  const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

/** Stripe de mentiras: firma webhooks de verdad y registra lo que el servidor le pide. */
export async function fakeStripe({ checkoutUrl = "https://checkout.stripe.test/s", founder = true } = {}) {
  const { default: Stripe } = await import("stripe");
  const s = new Stripe("sk_test_fake"), calls = [];
  let n = 0;
  s.prices.list = async ({ lookup_keys }) => ({ data: [{ id: "price_" + lookup_keys[0] }] });
  s.customers.create = async (p) => { calls.push(["customer", p]); return { id: "cus_" + ++n }; };
  s.coupons.retrieve = async () => ({ valid: founder, max_redemptions: 100, times_redeemed: 3 });
  s.checkout.sessions.create = async (p) => { calls.push(["checkout", p]); return { url: typeof checkoutUrl === "function" ? checkoutUrl(p) : checkoutUrl }; };
  s.billingPortal.sessions.create = async (p) => { calls.push(["portal", p]); return { url: "https://billing.stripe.test/p" }; };
  s.subscriptions.cancel = async (id) => { calls.push(["cancel", id]); return { id, status: "canceled" }; };
  s.subscriptions.retrieve = async (id) => s.__subs[id];
  s.invoices.createPreview = async () => ({ amount_due: 9900 });
  s.__subs = {};
  s.calls = calls;
  return s;
}
