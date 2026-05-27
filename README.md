# SpendLab

PWA de gastos compartidos construida con Next.js 16 + Supabase.

---

## Tabla de contenidos

1. [Stack](#stack)
2. [Levantar en local](#levantar-en-local)
3. [Variables de entorno](#variables-de-entorno)
4. [Configuración de Supabase](#configuración-de-supabase)
5. [Desplegar en Vercel](#desplegar-en-vercel)
6. [Passkeys (WebAuthn)](#passkeys-webauthn)
7. [Notificaciones push](#notificaciones-push)
8. [Invitaciones en tiempo real](#invitaciones-en-tiempo-real)
9. [Diferencias local vs producción](#diferencias-local-vs-producción)
10. [Scripts útiles](#scripts-útiles)

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

## Levantar en local

### Requisitos previos

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- Cuenta en [Supabase](https://supabase.com) (gratuita)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/spendlab.git
cd spendlab

# 2. Instalar dependencias
pnpm install

# 3. Crear variables de entorno locales
cp .env.example .env.local
# Edita .env.local con tus valores (ver sección Variables de entorno)

# 4. Ejecutar en modo desarrollo
pnpm dev
```

La app corre en `http://localhost:3741`.

> **Nota:** en desarrollo la PWA y el service worker están desactivados
> (next-pwa los omite en `NODE_ENV=development`). Para probar el SW,
> ejecuta `pnpm build && pnpm start`.

---

## Variables de entorno

### `.env.local` (local únicamente, nunca commitear)

```bash
# ── Supabase ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Service Role Key — NUNCA exponerla en el cliente
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ── WebAuthn / Passkeys ───────────────────────────────────────────────────
# RP ID = dominio sin protocolo ni puerto
WEBAUTHN_RP_ID=localhost

# URL completa de la app (usada como origin en la verificación WebAuthn)
NEXT_PUBLIC_APP_URL=http://localhost:3741

# ── Push notifications ────────────────────────────────────────────────────
# Generar con: npx web-push generate-vapid-keys
VAPID_SUBJECT=mailto:admin@tuapp.com
VAPID_PUBLIC_KEY=BF...
VAPID_PRIVATE_KEY=...

# Clave pública también disponible en el cliente para suscribir
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BF...

# Secreto que protege el endpoint /api/push/send (webhook de Supabase)
PUSH_WEBHOOK_SECRET=un_secreto_largo_aleatorio

# ── Solo en desarrollo: activa el inicio con contraseña ──────────────────
NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=true
```

### `.env.example` (commitear este archivo, sin valores)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WEBAUTHN_RP_ID=
NEXT_PUBLIC_APP_URL=
VAPID_SUBJECT=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
PUSH_WEBHOOK_SECRET=
NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=
```

> **En producción (Vercel)** NO añadas `NEXT_PUBLIC_ENABLE_PASSWORD_AUTH`.
> Al estar ausente, la opción de contraseña queda oculta automáticamente.

---

## Configuración de Supabase

### 1. Crear proyecto

1. Ir a [supabase.com](https://supabase.com) → New project
2. Elegir región (recomendado: South America o US East para latencia)
3. Guardar la contraseña de la base de datos

### 2. Ejecutar el schema

En **Supabase Dashboard → SQL Editor → New query**, pegar y ejecutar el contenido de:

```
supabase/schema.sql
```

Esto crea todas las tablas, políticas RLS, triggers, funciones RPC, y habilita
Realtime en `group_invitations` — todo de una sola pasada.

### 3. Habilitar Realtime en la tabla de invitaciones

1. Dashboard → **Database → Replication**
2. En la sección **Tables**, activar `group_invitations`

Esto permite que la pantalla de Grupos se actualice automáticamente cuando
alguien invita al usuario.

### 4. Configurar Auth

En **Dashboard → Authentication → URL Configuration**:

| Campo | Valor |
|-------|-------|
| Site URL | `https://tu-app.vercel.app` (o `http://localhost:3741` en local) |
| Redirect URLs | `https://tu-app.vercel.app/auth/callback` y `http://localhost:3741/auth/callback` |

En **Dashboard → Authentication → Email Templates** (opcional):
personalizar el template del magic link con el branding de la app.

### 5. Obtener credenciales

En **Dashboard → Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon / public key
- `SUPABASE_SERVICE_ROLE_KEY` → service_role key (guardar como secreto)

---

## Desplegar en Vercel

### 1. Conectar repositorio

1. Ir a [vercel.com](https://vercel.com) → New Project
2. Importar el repositorio de GitHub
3. Framework preset: **Next.js** (detectado automáticamente)
4. Build command: `pnpm build` (o dejar el predeterminado)
5. Install command: `pnpm install`

### 2. Configurar variables de entorno en Vercel

En **Vercel → Project → Settings → Environment Variables**, agregar:

| Variable | Entornos | Notas |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Marcar como "Sensitive" |
| `WEBAUTHN_RP_ID` | Production | El dominio real, ej. `spendlab.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | Production | `https://spendlab.vercel.app` |
| `VAPID_SUBJECT` | Production, Preview | `mailto:admin@tuapp.com` |
| `VAPID_PUBLIC_KEY` | Production, Preview | |
| `VAPID_PRIVATE_KEY` | Production, Preview | Marcar como "Sensitive" |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production, Preview | Igual que VAPID_PUBLIC_KEY |
| `PUSH_WEBHOOK_SECRET` | Production, Preview | Marcar como "Sensitive" |

> **NO** agregar `NEXT_PUBLIC_ENABLE_PASSWORD_AUTH` en Vercel.
> Su ausencia desactiva el login con contraseña en producción.

### 3. Dominio personalizado (opcional)

1. Vercel → Project → Settings → Domains → Add Domain
2. Agregar los registros DNS indicados por Vercel
3. Actualizar `WEBAUTHN_RP_ID` y `NEXT_PUBLIC_APP_URL` al dominio real
4. Actualizar la Site URL en Supabase Auth

### 4. Primer deploy

```bash
# Asegúrate de que el build funciona localmente primero:
pnpm build

# Luego hacer push al branch main:
git push origin main
```

Vercel desplegará automáticamente en cada push a `main`.

---

## Passkeys (WebAuthn)

### Cómo funciona

1. **Registro** (desde perfil, una vez logueado):
   - El usuario hace clic en **"Registrar passkey"**
   - El navegador pide autenticación biométrica (Touch ID, Face ID, Windows Hello)
   - La clave pública se guarda en `passkey_credentials` en Supabase
   - La clave privada **nunca sale del dispositivo**

2. **Login** (desde pantalla de inicio):
   - El usuario hace clic en **"Continuar con Passkey"**
   - El navegador muestra las passkeys disponibles para el dominio
   - El usuario se autentica con biometría
   - El servidor verifica la firma criptográfica
   - Se crea una sesión Supabase usando `admin.generateLink` → `verifyOtp`

### Restricciones importantes

- Las passkeys están **vinculadas al dominio (RPID)**. Una passkey registrada
  en `localhost` no funcionará en `spendlab.vercel.app` y viceversa.
- Para testear passkeys en local, usa `localhost` (no `127.0.0.1`).
- El botón "Registrar passkey" solo aparece si el dispositivo soporta
  autenticadores de plataforma (biometría o PIN de dispositivo).

### Tabla en Supabase

```sql
passkey_credentials
  id, user_id, credential_id, public_key,
  counter, device_type, backed_up, transports, created_at
```

---

## Notificaciones push

### Generar claves VAPID

```bash
npx web-push generate-vapid-keys
```

Copia `Public Key` → `VAPID_PUBLIC_KEY` y `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  
Copia `Private Key` → `VAPID_PRIVATE_KEY`

### Configurar el webhook en Supabase

Para que el servidor envíe una push cuando alguien invita a un usuario:

1. Dashboard → **Database → Webhooks → Create a new hook**
2. Configurar:
   - **Name:** `push_on_invitation`
   - **Table:** `group_invitations`
   - **Events:** `INSERT`
   - **URL:** `https://tu-app.vercel.app/api/push/send`
   - **HTTP Method:** `POST`
   - **HTTP Headers:**
     ```
     x-webhook-secret: <valor de PUSH_WEBHOOK_SECRET>
     Content-Type: application/json
     ```

### Flujo completo

```
Usuario A invita a B → INSERT en group_invitations
    → Supabase Webhook → POST /api/push/send
    → Busca suscripción de B en push_subscriptions
    → web-push envía notificación al navegador de B
    → Service Worker muestra la notificación
    → B hace clic → abre la app en /groups
```

### Actualización en tiempo real (sin push)

Independientemente de las push notifications, la pantalla de Grupos usa
**Supabase Realtime** para actualizarse automáticamente cuando llega una
invitación mientras la app está abierta. No requiere configuración adicional
más allá de habilitar Realtime en la tabla (ver paso 3 de Supabase).

---

## Diferencias local vs producción

| Característica | Local (`.env.local`) | Producción (Vercel) |
|----------------|---------------------|---------------------|
| Login con contraseña | ✅ Visible (`NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=true`) | ❌ Oculto |
| Magic link | ✅ | ✅ |
| Passkey | ✅ (solo `localhost`) | ✅ (dominio real) |
| PWA / Service Worker | ❌ (desactivado en dev) | ✅ |
| Push notifications | ❌ (sin SW activo) | ✅ |
| Realtime | ✅ | ✅ |

---

## Scripts útiles

```bash
# Desarrollo (Turbopack, sin SW)
pnpm dev

# Build de producción (genera SW, activa next-pwa)
pnpm build

# Iniciar servidor de producción local
pnpm start

# Regenerar iconos PWA a partir de public/icons/icon-512x512.png
pnpm generate-icons

# Generar claves VAPID para push notifications
npx web-push generate-vapid-keys

# Ver la app en producción local (con SW activo)
pnpm build && pnpm start
```

---

## Estructura relevante del proyecto

```
src/
  app/
    (auth)/login/          # Pantalla de inicio de sesión
    (app)/
      groups/              # Lista de grupos + invitaciones (Realtime)
      activity/            # Historial de gastos
      profile/             # Perfil + registro de passkey
    api/
      passkey/
        register/begin/    # POST: inicia registro WebAuthn
        register/finish/   # POST: verifica y guarda credencial
        auth/begin/        # POST: inicia autenticación WebAuthn
        auth/finish/       # POST: verifica y crea sesión Supabase
      push/
        subscribe/         # POST: guarda suscripción push del navegador
        send/              # POST: webhook de Supabase, envía push
  lib/supabase/
    client.ts              # Cliente Supabase (browser)
    server.ts              # Cliente Supabase (server, usa cookies)
    admin.ts               # Cliente Supabase con service role (server only)

supabase/
  schema.sql               # Schema completo — única fuente de verdad

worker/
  index.js                 # Handlers de push en el service worker
                           # (next-pwa lo fusiona en sw.js al hacer build)

public/
  manifest.json            # Web App Manifest (PWA)
  sw.js                    # Service Worker generado por next-pwa
```
