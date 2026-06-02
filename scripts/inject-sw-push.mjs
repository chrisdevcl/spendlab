/**
 * Appends push notification handlers to the Workbox-generated sw.js.
 *
 * next-pwa v5's customWorkerDir option silently fails to merge worker/index.js
 * into the Workbox SW (confirmed: deployed SW has no push/notificationclick
 * listeners, causing Chrome to reject pushManager.subscribe() with AbortError).
 * This script runs as a post-build step to inject the missing code.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const dir  = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "..");

const swPath     = resolve(root, "public", "sw.js");
const workerPath = resolve(root, "worker", "index.js");

if (!existsSync(swPath)) {
  console.warn("[inject-sw-push] public/sw.js not found — Workbox build may have failed, skipping");
  process.exit(0);
}

const sw     = readFileSync(swPath, "utf8");
const worker = readFileSync(workerPath, "utf8");

// Guard: don't double-inject (idempotent)
const MARKER = "// ── Injected by scripts/inject-sw-push.mjs";
if (sw.includes(MARKER)) {
  console.log("[inject-sw-push] Already injected — skipping");
  process.exit(0);
}

const injection = `

${MARKER}
// ─────────────────────────────────────────────────────────────────────────
// next-pwa v5 customWorkerDir silently drops worker/index.js in this config.
// Chrome refuses pushManager.subscribe() unless the SW has a "push" listener.

// clients.claim() — next-pwa's clientsClaim option is also ignored in v5,
// so we add it here to ensure the SW controls the page immediately after
// activation (fixes navigator.serviceWorker.controller being null).
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

${worker}
// ─────────────────────────────────────────────────────────────────────────
`;

const result = sw + injection;
writeFileSync(swPath, result, "utf8");
console.log(`[inject-sw-push] ✓ Push handlers + clients.claim injected into public/sw.js`);
console.log(`[inject-sw-push]   ${sw.length} → ${result.length} chars`);
