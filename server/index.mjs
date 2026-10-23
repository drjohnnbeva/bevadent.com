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

// Correo (para recuperar la contraseña). Con Gmail basta SMTP_USER y una contraseña de aplicación en SMTP_PASS.
let mailer = null;
if (env.SMTP_USER && env.SMTP_PASS) {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, "") } });
  const from = env.MAIL_FROM || `"OdontoCostos" <${env.SMTP_USER}>`;
  mailer = { send: (m) => transport.sendMail({ from, ...(env.SUPPORT_EMAIL && { replyTo: env.SUPPORT_EMAIL }), ...m }) };
  transport.verify().then(() => console.log("Correo listo"), (e) => console.error("El correo no conecta:", e.message));
}

const app = createApp({ db, env, mailer });
const billing = !!(db && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
app.listen(PORT, () => console.log(`OdontoCostos escuchando en ${PORT} (cuentas: ${db ? "sí" : "no"}, correo: ${mailer ? "sí" : "no"}, cobro: ${billing ? "sí" : "beta gratis"})`));
