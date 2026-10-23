# OdontoCostos

Costos, precios y finanzas para consultorios dentales en México. Calcula cuánto cuesta una hora de sillón, cuánto cobrar por cada tratamiento y cuánto le queda libre al dentista cada mes, con ISR estimado (RESICO o actividad profesional).

Tres planes:

| Plan | Precio (IVA incluido) | Fundador (primeros 100) |
|---|---|---|
| Gratis | $0 | $0 |
| Plus | $99/mes o $990/año | $49/mes |
| Pro | $199/mes o $1,990/año | $99/mes |

Al crear cuenta, cada dentista tiene 14 días de Pro sin tarjeta; después regresa a Gratis con sus datos guardados.

## Cómo está hecho

| Parte | Qué es |
|---|---|
| `index.html`, `src/landing/` | Página de venta (HTML estático, carga rápido y la encuentra Google) |
| `app/index.html`, `src/app/` | La app (React). Funciona en teléfono y computadora; se instala como app desde el navegador |
| `src/lib/` | Cálculos: costos, precios, ISR 2026, RESICO, nómina, estado de resultados, PDF |
| `privacidad/`, `terminos/` | Aviso de privacidad y términos |
| `server/index.mjs` | Servidor Express: sirve todo lo anterior y la API de cobro (Stripe) |
| `supabase/schema.sql` | Tablas y reglas de seguridad de la base de datos |
| `scripts/stripe-setup.mjs` | Crea productos, precios, cupón de fundador, portal y webhook en Stripe |
| `render.yaml` | Despliegue en Render con un clic |

Servicios: **Render** (hosting), **Supabase** (cuentas por enlace al correo y base de datos), **Stripe** (suscripciones en pesos).

Sin variables de entorno la app funciona igual, pero sin cuentas ni cobro: todos quedan en Gratis.

## Trabajar en el proyecto

```bash
npm install
npm run dev          # app en http://localhost:5173/app/ (vista previa, puedes cambiar de plan)
npm run check        # tipos + pruebas de cálculo + build
npm run e2e          # servidor, modo real con Supabase simulado y recorrido visual
```

Las capturas del recorrido quedan en `e2e/out/`.

## Lanzamiento, paso a paso

### 1. Supabase (cuentas y datos)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → New query → pega `supabase/schema.sql` → Run.
3. Authentication → URL Configuration:
   - Site URL: `https://odontocostos.com`
   - Redirect URLs: `https://odontocostos.com/app/`
4. Authentication → Emails → SMTP: conecta un servicio de correo (por ejemplo Resend). El correo de prueba de Supabase solo manda unos cuantos por hora.
5. Authentication → Email Templates, en español:
   - **Magic Link**, asunto `Tu enlace para entrar a OdontoCostos`:
     ```html
     <h2>Entra a OdontoCostos</h2>
     <p>Toca el botón para entrar. El enlace sirve una vez y vence en una hora.</p>
     <p><a href="{{ .ConfirmationURL }}">Entrar a OdontoCostos</a></p>
     <p>Si no pediste este correo, ignóralo.</p>
     ```
   - **Confirm signup**, asunto `Confirma tu cuenta de OdontoCostos`, con el mismo cuerpo y el botón `Confirmar y entrar`.
6. Project Settings → API: copia `Project URL`, `anon public` y `service_role` (esta última es secreta).

### 2. Stripe (cobro)

1. Crea tu cuenta en [stripe.com/mx](https://stripe.com/mx) y actívala con tu RFC y tu CLABE.
2. Primero en modo de prueba. En tu computadora:
   ```bash
   STRIPE_SECRET_KEY=sk_test_... APP_URL=https://odontocostos.com npm run stripe:setup
   ```
   Imprime `STRIPE_WEBHOOK_SECRET`, `STRIPE_FOUNDER_COUPON` y `STRIPE_PORTAL_CONFIG`.
3. Settings → Branding: logo y color `#0b7a61`.
4. Cuando todo funcione, repite el paso 2 con la llave `sk_live_...` y cambia las variables en Render.

### 3. Render (sitio)

1. Sube este proyecto a GitHub.
2. En [render.com](https://render.com): New → Blueprint → elige el repositorio. Render lee `render.yaml`.
3. Llena las variables (ver `.env.example`): `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_FOUNDER_COUPON`, `STRIPE_PORTAL_CONFIG`, `SUPPORT_EMAIL`.
4. Settings → Custom Domains → agrega `odontocostos.com` y apunta el DNS como te indique Render.
5. Abre `https://odontocostos.com/api/health`: debe decir `"billing": true, "accounts": true`.

El plan `starter` de Render cuesta unos $7 USD al mes y no se duerme. El gratuito tarda en despertar y los avisos de Stripe pueden fallar.

### 4. Antes de cobrar

- [ ] Reemplaza lo marcado en amarillo en `privacidad/index.html` y `terminos/index.html` (nombre, RFC, domicilio) y pide a un abogado que los revise.
- [ ] Cambia `VITE_SUPPORT_EMAIL` en `.env` por un correo que sí revises.
- [ ] Con tu contador: alta de la actividad de servicios digitales en tu RFC, IVA de 16% de la suscripción y cómo vas a emitir las facturas.
- [ ] Prueba una compra completa en modo de prueba con la tarjeta `4242 4242 4242 4242`: el plan debe activarse solo en unos segundos, y cancelar desde Administrar suscripción debe regresarte a Gratis al final del periodo.
- [ ] Revisa las respuestas de la encuesta en Supabase: `select would_pay, comment, created_at from feedback order by created_at desc;`

## Lo que sigue

1. **Leer los XML del SAT**: llenar ingresos y gastos del mes solo, sin capturar.
2. **Avisos por correo**: el día 17 se paga ISR, aparta tanto; vas abajo de tu punto de equilibrio.
3. **Facturación automática** de cada pago (por ejemplo con Facturapi).
4. **Plan anual por OXXO o transferencia**, como pago único.
5. **Entrar con Google**: ya está en el código; se activa con `GOOGLE_AUTH=1` después de configurarlo en Supabase.

## Fuentes de los cálculos fiscales

- Tarifa mensual de ISR 2026: Anexo 8 de la RMF 2026 (DOF 28/12/2025), artículo 96 LISR.
- RESICO personas físicas: artículo 113-E LISR.
- IVA exento del cirujano dentista: artículo 15, fracción XIV LIVA y artículo 41 de su reglamento.

Son estimaciones para planear; no sustituyen la declaración que prepara el contador.
