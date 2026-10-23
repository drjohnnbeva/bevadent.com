// Arranque en producción: conecta con Postgres (DATABASE_URL), crea las tablas y sirve la app.
import pg from "pg";
import { createApp, SCHEMA } from "./app.mjs";

const env = process.env;
const PORT = Number(env.PORT || 3000);
let db = null;
if (env.DATABASE_URL) {
  // Dentro de Render (dpg-…-a sin dominio) la conexión es privada y va sin SSL.
  const internal = /@(localhost|127\.0\.0\.1|dpg-[a-z0-9]+-a)(:\d+)?\//.test(env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10, ssl: internal || env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  pool.on("error", (e) => console.error("Postgres", e));
  db = { query: (text, params) => pool.query(text, params), exec: (sql) => pool.query(sql) };
  await db.exec(SCHEMA);
} else console.warn("Sin DATABASE_URL: el sitio funciona, pero sin cuentas (los datos se quedan en cada dispositivo).");

const app = createApp({ db, env });
const billing = !!(db && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
app.listen(PORT, () => console.log(`OdontoCostos escuchando en ${PORT} (cuentas: ${db ? "sí" : "no"}, cobro: ${billing ? "sí" : "beta gratis"})`));
