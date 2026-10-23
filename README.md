# OdontoCostos

Costos, precios y finanzas para consultorios dentales en México. Calcula cuánto cuesta una hora de sillón, cuánto cobrar por cada tratamiento y cuánto le queda libre al dentista cada mes, con ISR estimado (RESICO o actividad profesional).

Tres planes:

| Plan | Precio (IVA incluido) | Fundador (primeros 100) |
|---|---|---|
| Gratis | $0 | $0 |
| Plus | $99/mes o $990/año | $49/mes |
| Pro | $199/mes o $1,990/año | $99/mes |

Al crear cuenta, cada dentista tiene 14 días de Pro sin tarjeta; después regresa a Gratis con sus datos guardados.

**Beta:** mientras no estén las llaves de Stripe, el sitio corre en beta: quien crea su cuenta usa Pro gratis (60 días de prueba que siguen contando cuando empiece el cobro). Sin `DATABASE_URL` el sitio también funciona, pero sin cuentas: todos usan Pro y los datos se quedan en cada dispositivo.

## Cómo está hecho

| Parte | Qué es |
|---|---|
| `index.html`, `src/landing/` | Página de venta (HTML estático, carga rápido y la encuentra Google) |
| `app/index.html`, `src/app/` | La app (React). Funciona en teléfono y computadora; se instala como app desde el navegador |
| `src/lib/` | Cálculos: costos, precios, ISR 2026, RESICO, nómina, estado de resultados, PDF |
| `privacidad/`, `terminos/` | Aviso de privacidad y términos |
| `server/app.mjs` | API: cuentas con correo y contraseña, datos en la nube, encuesta, soporte, cobro con Stripe y panel del dueño |
| `server/schema.sql` | Tablas de Postgres; el servidor las crea solo al arrancar |
| `scripts/stripe-setup.mjs` | Crea productos, precios, cupón de fundador, portal y webhook en Stripe |
| `render.yaml` | Despliegue en Render: servicio web y base de datos |

Servicios: **Render** (sitio y base de datos Postgres) y **Stripe** (suscripciones en pesos).

Contraseñas con scrypt; las sesiones duran 90 días y en la base solo se guarda el hash del token.

## Trabajar en el proyecto

```bash
npm install
npm run dev          # app en http://localhost:5173/app/ (vista previa, puedes cambiar de plan)
npm run check        # tipos + pruebas de cálculo + build
npm run e2e          # servidor y navegador con Postgres en memoria (PGlite) y recorrido visual
```

Las capturas del recorrido quedan en `e2e/out/`.

## Panel del dueño

`https://odontocostos.com/admin`, usuario `admin` y la contraseña de `ADMIN_PASSWORD`. Muestra cuentas, suscripciones, ingreso mensual, respuestas de la encuesta y mensajes de soporte. Desde ahí se genera una contraseña temporal para quien olvidó la suya.

## Lanzamiento, paso a paso

### 1. Render (sitio y base de datos)

Ya está hecho: servicio `odontocostos` y base `odontocostos-db`, publicados desde la rama `odontocostos` de este repositorio. Cada `git push` a esa rama publica solo.

Variables del servicio (ver `.env.example`): `DATABASE_URL` (Internal Database URL de `odontocostos-db`), `APP_URL`, `ADMIN_PASSWORD`, `SUPPORT_EMAIL`, `NODE_VERSION=22`.

Abre `/api/health`: debe decir `"accounts": true`.

### 2. Dominio

Compra `odontocostos.com` (o el que elijas). En Render: servicio → Settings → Custom Domains → agrega el dominio y apunta el DNS como te indique. Luego cambia `APP_URL`.

### 3. Stripe (cobro)

1. Crea tu cuenta en [stripe.com/mx](https://stripe.com/mx) y actívala con tu RFC y tu CLABE.
2. Primero en modo de prueba. En tu computadora:
   ```bash
   STRIPE_SECRET_KEY=sk_test_... APP_URL=https://odontocostos.com npm run stripe:setup
   ```
   Imprime `STRIPE_WEBHOOK_SECRET`, `STRIPE_FOUNDER_COUPON` y `STRIPE_PORTAL_CONFIG`.
3. Pon `STRIPE_SECRET_KEY` y esas tres variables en Render. Al reiniciar, la beta termina y empieza el cobro (cuentas nuevas: 14 días de prueba).
4. Settings → Branding: logo y color `#0b7a61`.
5. Cuando todo funcione, repite el paso 2 con la llave `sk_live_...` y cambia las variables en Render.

### 4. Antes de cobrar

- [ ] Reemplaza lo marcado en amarillo en `privacidad/index.html` y `terminos/index.html` (nombre, RFC, domicilio) y pide a un abogado que los revise.
- [ ] Avisa por correo a los de la beta con 15 días de anticipación (lo prometen los términos). Los correos están en el panel.
- [ ] Con tu contador: alta de la actividad de servicios digitales en tu RFC, IVA de 16% de la suscripción y cómo vas a emitir las facturas.
- [ ] Prueba una compra completa en modo de prueba con la tarjeta `4242 4242 4242 4242`: el plan debe activarse solo en unos segundos, y cancelar desde Administrar suscripción debe regresarte a Gratis al final del periodo.

## Lo que sigue

1. **Leer los XML del SAT**: llenar ingresos y gastos del mes solo, sin capturar.
2. **Avisos por correo**: el día 17 se paga ISR, aparta tanto; vas abajo de tu punto de equilibrio.
3. **Facturación automática** de cada pago (por ejemplo con Facturapi).
4. **Plan anual por OXXO o transferencia**, como pago único.
5. **Recuperar contraseña por correo**: hoy se pide por el formulario de soporte y se resuelve desde el panel.

## Fuentes de los cálculos fiscales

- Tarifa mensual de ISR 2026: Anexo 8 de la RMF 2026 (DOF 28/12/2025), artículo 96 LISR.
- RESICO personas físicas: artículo 113-E LISR.
- IVA exento del cirujano dentista: artículo 15, fracción XIV LIVA y artículo 41 de su reglamento.

Son estimaciones para planear; no sustituyen la declaración que prepara el contador.
