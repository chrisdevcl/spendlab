/**
 * Genera nuevas claves VAPID, actualiza .env.local automáticamente
 * y opcionalmente las sube a Vercel vía API.
 *
 * Uso:
 *   pnpm generate-vapid-keys
 *   pnpm generate-vapid-keys --vercel        (también actualiza Vercel)
 */

import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const dir  = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "..");

// ── 1. Generar claves ─────────────────────────────────────────────────────────

const keys = webpush.generateVAPIDKeys();

console.log("\n✓ Claves VAPID generadas:");
console.log(`  Public : ${keys.publicKey}`);
console.log(`  Private: ${keys.privateKey}\n`);

// ── 2. Actualizar .env.local ──────────────────────────────────────────────────

const envPath = resolve(root, ".env.local");

if (existsSync(envPath)) {
  let env = readFileSync(envPath, "utf8");

  const replacements = {
    VAPID_PUBLIC_KEY:            keys.publicKey,
    VAPID_PRIVATE_KEY:           keys.privateKey,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(env)) {
      env = env.replace(pattern, `${key}=${value}`);
    } else {
      env += `\n${key}=${value}`;
    }
  }

  writeFileSync(envPath, env, "utf8");
  console.log("✓ .env.local actualizado\n");
} else {
  console.warn("⚠ .env.local no encontrado — créalo copiando .env.example\n");
}

// ── 3. Actualizar Vercel via API (si se pasa --vercel) ────────────────────────

const uploadToVercel = process.argv.includes("--vercel");

if (!uploadToVercel) {
  console.log("→ Para actualizar Vercel automáticamente ejecuta:");
  console.log("  pnpm generate-vapid-keys --vercel\n");
  console.log("  (requiere VERCEL_TOKEN y VERCEL_PROJECT_ID en .env.local)\n");
  process.exit(0);
}

// Leer token y project ID desde .env.local
const envRaw   = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const getVar   = (name) => envRaw.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();

const token     = getVar("VERCEL_TOKEN");
const projectId = getVar("VERCEL_PROJECT_ID");

if (!token || !projectId) {
  console.error("✗ Faltan VERCEL_TOKEN y/o VERCEL_PROJECT_ID en .env.local");
  console.error("  Añádelos así:");
  console.error("    VERCEL_TOKEN=<token de vercel.com/account/tokens>");
  console.error("    VERCEL_PROJECT_ID=<ID del proyecto en vercel.com/project/settings>\n");
  process.exit(1);
}

const vercelVars = [
  { key: "VAPID_PUBLIC_KEY",             value: keys.publicKey,  target: ["production", "preview"] },
  { key: "VAPID_PRIVATE_KEY",            value: keys.privateKey, target: ["production", "preview"] },
  { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: keys.publicKey,  target: ["production", "preview"] },
];

console.log("Subiendo a Vercel…");

for (const v of vercelVars) {
  // Buscar si ya existe para hacer PATCH en lugar de POST
  const listRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?key=${v.key}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const list = await listRes.json();
  const existing = list.envs?.find((e) => e.key === v.key);

  let res;
  if (existing) {
    res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env/${existing.id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: v.value, target: v.target, type: "plain" }),
      }
    );
  } else {
    res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: v.key, value: v.value, target: v.target, type: "plain" }),
      }
    );
  }

  if (res.ok) {
    console.log(`  ✓ ${v.key}`);
  } else {
    const err = await res.json();
    console.error(`  ✗ ${v.key}: ${err.error?.message ?? JSON.stringify(err)}`);
  }
}

console.log("\n✓ Listo. Redeploya en Vercel para aplicar los cambios:");
console.log("  vercel --prod\n");
