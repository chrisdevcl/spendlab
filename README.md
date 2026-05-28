# SpendLab

PWA de gastos compartidos construida con Next.js 16 + Supabase.

---

## Tabla de contenidos

1. [Stack](#stack)
2. [Conceptos clave](#conceptos-clave)
3. [Requisitos previos](#requisitos-previos)
4. [Levantar en local](#levantar-en-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Configurar Supabase](#configurar-supabase)
7. [Passkeys — puntos importantes](#passkeys--puntos-importantes)
8. [Configurar notificaciones push](#configurar-notificaciones-push)
9. [Desplegar en Vercel](#desplegar-en-vercel)
10. [Diferencias local vs producción](#diferencias-local-vs-producción)
11. [Scripts útiles](#scripts-útiles)

---

## Stack

| Capa            | Tecnología                                        |
|-----------------|---------------------------------------------------|
| Framework       | Next.js 16 (App Router, Turbopack en dev)         |
| Base de datos   | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Auth            | Magic Link · Passkeys (WebAuthn)                  |
| PWA             | next-pwa v5 (Workbox)                             |
| Push            | Web Push API + VAPID                              |
| Estilos         | CSS Modules                                       |
| Deploy          | Vercel                                            |
| Package manager | pnpm                                              |

---

## Conceptos clave

Antes de empezar, una explicación rápida de los términos que aparecerán en la configuración:

### Passkeys

Una passkey es una forma de autenticarse **sin contraseña**. El navegador guarda una clave criptográfica en tu dispositivo y la protege con biometría (Touch ID, Face ID, Windows Hello o el PIN del dispositivo). Cuando el usuario hace clic en "Continuar con Passkey", el navegador hace todo el trabajo sin que el usuario tenga que recordar nada.

- La clave privada **nunca sale del dispositivo**.
- Están **vinculadas al dominio**: una passkey registrada en `localhost` no funciona en `spendlab.vercel.app` y viceversa. Son configuraciones completamente separadas.
- Solo aparece la opción si el dispositivo tiene un autenticador de plataforma disponible (casi todos los teléfonos y laptops modernos lo tienen).

### VAPID (notificaciones push)

VAPID es el protocolo de seguridad que permite que tu servidor envíe notificaciones push al navegador del usuario **aunque la app esté cerrada**. Funciona así:

1. Tú generas un **par de claves** (pública + privada) una sola vez.
2. La clave pública se comparte con el navegador del usuario cuando se suscribe a notificaciones.
3. Cuando tu servidor quiere enviar una notificación, la firma con la clave privada. El navegador verifica que la firma es válida y muestra la notificación.

Las claves VAPID las generas **en tu terminal** una sola vez. El resultado son dos strings largos que guardas como variables de entorno.

### Magic Link

El método de login por defecto. El usuario ingresa su correo y Supabase le envía un enlace de acceso. Al hacer clic en el enlace, el usuario queda autenticado. No requiere contraseña.

---

## Requisitos previos

Instala esto en tu máquina antes de empezar:

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **pnpm** — gestor de paquetes: `npm install -g pnpm`
- **Cuenta en Supabase** (gratuita) — [supabase.com](https://supabase.com)
- **Cuenta en Vercel** (gratuita, solo para deploy) — [vercel.com](https://vercel.com)

---

## Levantar en local

Todo esto se hace **en tu terminal**, en la carpeta del proyecto.

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/spendlab.git
cd spendlab

# 2. Instalar dependencias
pnpm install

# 3. Crear el archivo de variables de entorno locales
cp .env.example .env.local
# Abre .env.local en tu editor y completa los valores
# (ver la sección "Variables de entorno" más abajo)

# 4. Iniciar el servidor de desarrollo
pnpm dev
```

La app corre en `http://localhost:3741`.

> **Sobre la PWA y el Service Worker:** en desarrollo están desactivados intencionalmente (next-pwa los omite en `NODE_ENV=development`). Esto significa que las notificaciones push no funcionarán en local. Para probar la PWA completa, ejecuta `pnpm build && pnpm start`.

---

## Variables de entorno

### Cómo funciona

- **`.env.local`** — Solo existe en tu máquina. Nunca se commitea. Lo creas copiando `.env.example`.
- **Variables de Vercel** — Las agregas desde el dashboard de Vercel para que estén disponibles en producción (ver [Desplegar en Vercel](#desplegar-en-vercel)).

### Contenido de `.env.local`

Abre el archivo en tu editor y completa cada valor:

```bash
# ── Supabase ──────────────────────────────────────────────────────────────
# Los encuentras en: Supabase Dashboard → tu proyecto → Project Settings → API

NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
# ↑ NUNCA expongas esta clave en el cliente ni la commitees

# ── Passkeys (WebAuthn) ────────────────────────────────────────────────────
# WEBAUTHN_RP_ID = el dominio donde corre la app, sin protocolo ni puerto
# En local siempre es "localhost" (no uses 127.0.0.1)
WEBAUTHN_RP_ID=localhost

# URL completa de la app (usada para verificar el origin en WebAuthn)
NEXT_PUBLIC_APP_URL=http://localhost:3741

# ── Push notifications (VAPID) ────────────────────────────────────────────
# Genera estas claves UNA SOLA VEZ en tu terminal:
#   npx web-push generate-vapid-keys
# Copia Public Key → VAPID_PUBLIC_KEY y NEXT_PUBLIC_VAPID_PUBLIC_KEY
# Copia Private Key → VAPID_PRIVATE_KEY

VAPID_SUBJECT=mailto:tu@email.com
VAPID_PUBLIC_KEY=BF...
VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BF...
# ↑ Mismo valor que VAPID_PUBLIC_KEY. Se necesita en el cliente para
#   que el navegador sepa a qué servidor suscribirse.

# Secreto para proteger el webhook de Supabase → /api/push/send
# Genera un string aleatorio largo, por ejemplo:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PUSH_WEBHOOK_SECRET=un_secreto_largo_aleatorio

# ── Solo en desarrollo ────────────────────────────────────────────────────
# Descomenta esta línea para habilitar login con contraseña en local
# NO la pongas en producción (Vercel)
NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=true
```

---

## Configurar Supabase

### Paso 1 — Crear el proyecto

**En el navegador → [supabase.com](https://supabase.com):**

1. Haz clic en **New project**
2. Elige un nombre y una región (South America o US East tienen menor latencia)
3. Guarda la contraseña de la base de datos en un lugar seguro

### Paso 2 — Crear las tablas

**En el navegador → Supabase Dashboard → SQL Editor → New query:**

1. Abre el archivo `supabase/schema.sql` de este repositorio
2. Copia todo el contenido y pégalo en el editor SQL de Supabase
3. Haz clic en **Run**

Esto crea todas las tablas, políticas de seguridad (RLS), triggers, funciones y habilita Realtime en la tabla de invitaciones — todo de una sola pasada.

### Paso 3 — Activar Realtime

**En el navegador → Supabase Dashboard → Database → Replication:**

En la sección **Tables**, activa el toggle de la tabla `group_invitations`.

Esto permite que la pantalla de Grupos se actualice automáticamente cuando alguien invita al usuario, sin necesidad de recargar la página.

### Paso 4 — Configurar Auth (importante: URL del email de verificación)

**En el navegador → Supabase Dashboard → Authentication → URL Configuration:**

| Campo             | Qué poner                                                                      |
|-------------------|--------------------------------------------------------------------------------|
| **Site URL**      | `https://tu-app.vercel.app` (la URL de producción)                             |
| **Redirect URLs** | `https://tu-app.vercel.app/auth/callback, http://localhost:3741/auth/callback` |

Agrega **ambas URLs** en el campo Redirect URLs separadas por coma.

> **¿Por qué el email trae un enlace a localhost?**
> La app le dice a Supabase a dónde redirigir después del login, y en desarrollo esa dirección es `http://localhost:3741/auth/callback`. En producción será la URL de Vercel automáticamente — el código no necesita tocarse.
>
> El error ocurre cuando Supabase rechaza el redirect porque la URL no está en su lista blanca. La solución es agregar las dos URLs a **Redirect URLs** como se muestra arriba. Una vez hecho, el email en producción llevará a tu app en Vercel y en local a localhost, según desde dónde se haya iniciado sesión.

### Paso 5 — Obtener las credenciales

**En el navegador → Supabase Dashboard → Project Settings → API:**

Copia estos valores a tu `.env.local`:

| Variable                        | Dónde encontrarla |
|---------------------------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key  |

---

## Passkeys — puntos importantes

### No necesitas configurar nada extra en Supabase

La tabla `passkey_credentials` y todas sus políticas de seguridad ya están incluidas en `supabase/schema.sql`. Al ejecutar el schema en el Paso 2, las passkeys quedan listas. No hay ningún paso adicional en el dashboard de Supabase.

### Las passkeys están atadas al dominio

Esta es la parte más importante a entender antes de hacer deploy:

**Las passkeys están vinculadas al dominio exacto donde se registraron.** Una passkey registrada en `localhost` no funcionará en `tu-app.vercel.app`, y viceversa. Son dos mundos completamente separados — no hay migración posible, es una limitación del estándar WebAuthn.

| Situación                                        | ¿Qué pasa con las passkeys?                                                                               |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| Local → primer deploy en Vercel                  | Las de `localhost` no sirven en producción. Normal y esperado.                                            |
| `tu-app.vercel.app` → dominio propio `tuapp.com` | Las passkeys de `.vercel.app` dejan de funcionar. Los usuarios deben registrar una nueva desde su perfil. |
| Nuevo deploy de código, misma URL                | No afecta nada. El dominio no cambió.                                                                     |
| Preview deployments de Vercel                    | URL distinta = passkeys separadas. Siempre distintas a producción.                                        |

**La regla práctica:** elige tu dominio definitivo antes de que los usuarios registren passkeys. Si cambias de dominio después, tendrás que avisarles que registren su passkey de nuevo desde la pantalla de Perfil.

### Cómo afecta a las variables de entorno

El `WEBAUTHN_RP_ID` debe ser **solo el dominio, sin `https://` ni rutas**:

| Entorno        | Valor correcto      |
|----------------|---------------------|
| Local          | `localhost`         |
| Vercel         | `tu-app.vercel.app` |
| Dominio propio | `tuapp.com`         |

Si pones la URL completa (`https://tu-app.vercel.app`) el registro de passkeys fallará.

---

## Configurar notificaciones push

Las notificaciones push solo funcionan en producción (cuando hay un Service Worker activo). En local el flujo de suscripción existe pero no enviará notificaciones reales.

### Paso 1 — Generar las claves VAPID

**En tu terminal** (en la carpeta del proyecto, una sola vez):

```bash
npx web-push generate-vapid-keys
```

Verás algo así:

```
Public Key:
BF9abcDEF...

Private Key:
xyzABC123...
```

- Copia **Public Key** → pégala en `VAPID_PUBLIC_KEY` y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (en `.env.local` y luego en Vercel)
- Copia **Private Key** → pégala solo en `VAPID_PRIVATE_KEY` (nunca la expongas)

> **Importante:** genera las claves una sola vez y usa las mismas en local y en producción. Si las cambias, los usuarios suscritos dejarán de recibir notificaciones.

### Paso 2 — Crear el webhook en Supabase

Cuando alguien invita a un usuario, Supabase debe avisar a la app para que envíe la notificación push. Esto se configura con un webhook.

**En el navegador → Supabase Dashboard → Database → Webhooks → Create a new hook:**

| Campo       | Valor                                     |
|-------------|-------------------------------------------|
| Name        | `push_on_invitation`                      |
| Table       | `group_invitations`                       |
| Events      | `INSERT`                                  |
| URL         | `https://tu-app.vercel.app/api/push/send` |
| HTTP Method | `POST`                                    |

En **HTTP Headers**, agrega:

| Header             | Valor                                         |
|--------------------|-----------------------------------------------|
| `x-webhook-secret` | El valor que pusiste en `PUSH_WEBHOOK_SECRET` |
| `Content-Type`     | `application/json`                            |

### Cómo funciona el flujo completo

```
Usuario A invita a B
  → Se inserta una fila en group_invitations
  → Supabase dispara el webhook → POST /api/push/send
  → El servidor busca la suscripción push de B
  → web-push envía la notificación al navegador de B
  → El Service Worker muestra la notificación
  → B hace clic → se abre la app en /groups
```

---

## Desplegar en Vercel

### Paso 1 — Conectar el repositorio

**En el navegador → [vercel.com](https://vercel.com):**

1. Haz clic en **Add New → Project**
2. Importa el repositorio desde GitHub
3. Vercel detectará automáticamente que es Next.js
4. Haz clic en **Deploy** (aún no funcionará bien porque faltan las variables de entorno)

### Paso 2 — Agregar las variables de entorno

**En el navegador → Vercel → tu proyecto → Settings → Environment Variables:**

Agrega cada variable con el entorno correspondiente (Production / Preview):

| Variable                        | Entorno             | Valor                                      | Notas                     |
|---------------------------------|---------------------|--------------------------------------------|---------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Production, Preview | URL de Supabase                            |                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | anon key de Supabase                       |                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Production, Preview | service_role key                           | Marcar como **Sensitive** |
| `WEBAUTHN_RP_ID`                | Production          | Tu dominio real, ej. `spendlab.vercel.app` | Sin `https://` ni `/`     |
| `NEXT_PUBLIC_APP_URL`           | Production          | `https://spendlab.vercel.app`              | Con `https://`            |
| `VAPID_SUBJECT`                 | Production, Preview | `mailto:tu@email.com`                      |                           |
| `VAPID_PUBLIC_KEY`              | Production, Preview | La Public Key generada                     |                           |
| `VAPID_PRIVATE_KEY`             | Production, Preview | La Private Key generada                    | Marcar como **Sensitive** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | Production, Preview | Mismo valor que VAPID_PUBLIC_KEY           |                           |
| `PUSH_WEBHOOK_SECRET`           | Production, Preview | El secreto que generaste                   | Marcar como **Sensitive** |

> **NO agregues** `NEXT_PUBLIC_ENABLE_PASSWORD_AUTH` en Vercel. Al no estar definida, el login con contraseña queda oculto automáticamente en producción.

### Paso 3 — Hacer el primer deploy real

Después de agregar las variables, haz un redeploy:

**En el navegador → Vercel → tu proyecto → Deployments → el último deploy → Redeploy**

O simplemente **en tu terminal**:

```bash
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

Vercel desplegará automáticamente en cada push a `main`.

### Paso 4 — Actualizar Supabase con la URL de producción

Ahora que tienes una URL real en Vercel, vuelve a Supabase y actualiza:

**En el navegador → Supabase Dashboard → Authentication → URL Configuration:**
- **Site URL:** `https://tu-app.vercel.app`
- **Redirect URLs:** agrega `https://tu-app.vercel.app/auth/callback`

### Paso 5 — Dominio personalizado (opcional)

Si quieres usar tu propio dominio en lugar del `.vercel.app`:

1. **Vercel → Settings → Domains → Add Domain** — agrega tu dominio
2. Configura los registros DNS según las instrucciones de Vercel
3. Vuelve a Vercel y actualiza `WEBAUTHN_RP_ID` y `NEXT_PUBLIC_APP_URL` al nuevo dominio
4. Vuelve a Supabase y actualiza Site URL y Redirect URLs

---

## Diferencias local vs producción

| Característica           | Local (`.env.local`)    | Producción (Vercel) |
|--------------------------|-------------------------|---------------------|
| Login con contraseña     | ✅ Visible               | ❌ Oculto            |
| Magic link               | ✅                       | ✅                   |
| Passkeys                 | ✅ (solo en `localhost`) | ✅ (dominio real)    |
| PWA / Service Worker     | ❌ Desactivado en dev    | ✅                   |
| Push notifications       | ❌ Sin SW activo         | ✅                   |
| Realtime de invitaciones | ✅                       | ✅                   |

---

## Scripts útiles

Todos se ejecutan **en tu terminal**, en la carpeta del proyecto:

```bash
# Iniciar en desarrollo (Turbopack, sin Service Worker)
pnpm dev

# Build de producción (compila la app, genera el Service Worker)
pnpm build

# Iniciar servidor de producción local (útil para probar la PWA)
pnpm start

# Build + arrancar en una sola línea (para probar la PWA completa en local)
pnpm build && pnpm start

# Regenerar los iconos de la PWA a partir de public/icons/icon-512x512.png
pnpm generate-icons

# Generar un nuevo par de claves VAPID (solo si nunca lo has hecho)
npx web-push generate-vapid-keys

# Generar un secreto aleatorio para PUSH_WEBHOOK_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Estructura relevante del proyecto

```
src/
  app/
    (auth)/login/          # Pantalla de inicio de sesión
    (app)/
      groups/              # Lista de grupos + invitaciones
      activity/            # Historial de gastos
      profile/             # Perfil + registro de passkey
    api/
      passkey/
        register/begin/    # POST: inicia registro WebAuthn
        register/finish/   # POST: verifica y guarda la passkey
        auth/begin/        # POST: inicia autenticación WebAuthn
        auth/finish/       # POST: verifica la firma y crea sesión
      push/
        subscribe/         # POST: guarda la suscripción push del navegador
        send/              # POST: webhook de Supabase, envía la notificación
  lib/supabase/
    client.ts              # Cliente Supabase (browser)
    server.ts              # Cliente Supabase (server, usa cookies)
    admin.ts               # Cliente Supabase con service role (solo server)

supabase/
  schema.sql               # Schema completo — única fuente de verdad

worker/
  index.js                 # Handlers de push en el Service Worker
                           # (next-pwa lo fusiona en sw.js al hacer build)

public/
  manifest.json            # Web App Manifest (PWA)
  icons/                   # Iconos de la app (generados con pnpm generate-icons)
```
