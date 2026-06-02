"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Profile } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { updateDisplayName, signOut, deleteAccount } from "../actions";
import type { ProfileStats, PasskeyItem } from "../page";
import styles from "./profile-view.module.css";

interface Props {
  profile: Profile | null;
  stats: ProfileStats;
  passkeys: PasskeyItem[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileView({ profile, stats, passkeys }: Props) {
  const router = useRouter();
  const email  = profile?.email ?? "";

  // ── Name editing ────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "Usuario");
  const [editing, setEditing]         = useState(false);
  const [nameValue, setNameValue]     = useState(displayName);
  const [nameError, setNameError]     = useState("");
  const [isPendingName, startNameTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 40);
    return () => clearTimeout(t);
  }, [editing]);

  function cancelEdit() {
    setEditing(false);
    setNameError("");
  }

  function saveName() {
    startNameTransition(async () => {
      const result = await updateDisplayName(nameValue);
      if (result.error) {
        setNameError(result.error);
      } else {
        setDisplayName(nameValue.trim());
        setEditing(false);
        router.refresh();
      }
    });
  }

  // ── Passkeys ────────────────────────────────────────────────────────────────
  // Computed synchronously — PublicKeyCredential is available in all modern browsers
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => {
    if (typeof PublicKeyCredential === "undefined") return;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setPasskeySupported)
      .catch(() => {});
  }, []);

  const passkeyCount = passkeys.length;

  // ── Notifications ────────────────────────────────────────────────────────────
  const notifSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission | null>(() =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : null
    );
  const [isSubscribed, setIsSubscribed]     = useState(false);
  const [notifLoading, setNotifLoading]     = useState(false);
  const [notifErr, setNotifErr]             = useState("");
  const [notifErrDetail, setNotifErrDetail] = useState("");
  // null = still checking, true/false = resolved
  const [swReady, setSwReady]               = useState<boolean | null>(
    notifSupported ? null : false
  );
  const [diagLoading, setDiagLoading]       = useState(false);
  const [diagInfo, setDiagInfo]             = useState<string | null>(null);

  // Detect SW registration and existing subscription on mount.
  // controllerchange fires when SW finishes installing → re-check.
  useEffect(() => {
    if (!notifSupported) return;

    async function syncSwState() {
      try {
        // Use the SW controlling this page — most reliable source of truth
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((res) => setTimeout(() => res(null), 3000)),
        ]);
        if (!reg) { setSwReady(false); setIsSubscribed(false); return; }

        setSwReady(true);
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        setIsSubscribed(!!sub);
      } catch {
        setSwReady(false);
        setIsSubscribed(false);
      }
    }

    syncSwState();
    navigator.serviceWorker.addEventListener("controllerchange", syncSwState);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", syncSwState);
    };
  }, [notifSupported]);

  // Use the SW that currently controls this page — more reliable than scanning registrations
  async function getSwReg(): Promise<ServiceWorkerRegistration> {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Service worker no disponible. Recarga la página.")), 8000)
      ),
    ]);
  }

  async function runDiagnostic() {
    setDiagLoading(true);
    setDiagInfo(null);
    const lines: string[] = [];
    try {
      // 1. SW registrations
      const regs = await navigator.serviceWorker.getRegistrations();
      lines.push(`SWs registrados: ${regs.length}`);
      for (const r of regs) {
        const sub = await r.pushManager.getSubscription().catch(() => null);
        lines.push(`  scope=${r.scope} active=${r.active?.state ?? "—"} sub=${sub ? sub.endpoint.substring(0, 40) + "…" : "ninguna"}`);
      }

      // 2. SW controlador
      const ctrl = navigator.serviceWorker.controller;
      lines.push(`SW controller: ${ctrl ? `${ctrl.scriptURL} (${ctrl.state})` : "ninguno"}`);

      // 3. VAPID key local
      const vk = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      lines.push(`NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${vk ? `${vk.length} chars, inicia=${vk.substring(0,8)}…` : "NO DEFINIDA"}`);

      if (vk) {
        const { urlBase64ToUint8Array } = await import("@/lib/utils/push");
        let bytes: Uint8Array<ArrayBuffer> | null = null;
        try {
          bytes = urlBase64ToUint8Array(vk);
          lines.push(`  decode: ${bytes.length} bytes, primer byte: 0x${bytes[0]?.toString(16)} ${bytes.length === 65 && bytes[0] === 4 ? "✓ format OK" : "✗ INVÁLIDA"}`);
        } catch (e) {
          lines.push(`  decode ERROR: ${e}`);
        }
        // WebCrypto P-256 curve validation — deeper check than byte length
        if (bytes) {
          try {
            await crypto.subtle.importKey(
              "raw",
              bytes,
              { name: "ECDH", namedCurve: "P-256" },
              true,
              []
            );
            lines.push(`  WebCrypto P-256: ✓ punto válido en la curva`);
          } catch (e) {
            lines.push(`  WebCrypto P-256: ✗ NO ES PUNTO VÁLIDO — ${e}`);
            lines.push(`  → Regenera las claves VAPID`);
          }
        }
      }

      // 4. Server-side VAPID check
      try {
        const r = await fetch("/api/push/debug");
        if (r.ok) {
          const data = await r.json() as Record<string, unknown>;
          lines.push(`--- Servidor ---`);
          lines.push(`VAPID_PUBLIC_KEY: ${(data.serverPublicKey as { set?: boolean; length?: number } | undefined)?.set ? `${(data.serverPublicKey as { length?: number }).length} chars` : "NO DEFINIDA"}`);
          lines.push(`NEXT_PUBLIC (server): ${(data.clientPublicKey as { set?: boolean; length?: number } | undefined)?.set ? `${(data.clientPublicKey as { length?: number }).length} chars` : "NO DEFINIDA"}`);
          lines.push(`Claves coinciden: ${data.keysMatch ? "✓ SÍ" : "✗ NO — PROBLEMA DETECTADO"}`);
          const dec = data.keyDecodeInfo as { length?: number; firstByte?: number; valid?: boolean; error?: string } | undefined;
          if (dec?.error) lines.push(`Decode error: ${dec.error}`);
          else lines.push(`Decode server: ${dec?.length} bytes, primer byte: 0x${dec?.firstByte?.toString(16)} ${dec?.valid ? "✓" : "✗"}`);
          lines.push(`VAPID_SUBJECT: ${data.subject ?? "NO DEFINIDO"}`);
          lines.push(`Suscripciones en DB: ${data.subscriptionsInDb}`);
        } else {
          lines.push(`Server debug: HTTP ${r.status}`);
        }
      } catch (e) {
        lines.push(`Server debug error: ${e}`);
      }

      // 5. pushManager.permissionState + permiso
      lines.push(`Notif.permission: ${Notification.permission}`);
      try {
        const ps = await navigator.permissions.query({ name: "notifications" as PermissionName });
        lines.push(`Permissions API: ${ps.state}`);
      } catch {
        lines.push(`Permissions API: no disponible`);
      }
      // pushManager.permissionState tells us what Chrome thinks about push for THIS VAPID key
      if (regs.length > 0 && vk) {
        try {
          const { urlBase64ToUint8Array } = await import("@/lib/utils/push");
          const bytes = urlBase64ToUint8Array(vk);
          const pState = await regs[0].pushManager.permissionState({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          });
          lines.push(`pushManager.permissionState: ${pState} ${pState === "granted" ? "✓" : "✗"}`);
        } catch (e) {
          lines.push(`pushManager.permissionState ERROR: ${e}`);
        }
      }

      console.log("[push:diag]\n" + lines.join("\n"));
    } catch (e) {
      lines.push(`Diagnóstico error: ${e}`);
    } finally {
      setDiagInfo(lines.join("\n"));
      setDiagLoading(false);
    }
  }

  async function enableNotifications() {
    setNotifErr("");
    setNotifLoading(true);
    try {
      console.log("[push:enable] 1. requestPermission");
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      console.log("[push:enable] 2. permission =", permission);
      if (permission !== "granted") {
        setNotifLoading(false);
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setNotifErr("Clave VAPID no configurada.");
        return;
      }

      console.log("[push:enable] 3. getSwReg…");
      const reg = await getSwReg();
      console.log("[push:enable] 4. SW reg:", {
        scope: reg.scope,
        scriptURL: (reg as unknown as { scope: string; updateViaCache?: string }).scope,
        active: reg.active?.state,
        waiting: reg.waiting?.state,
        installing: reg.installing?.state,
      });

      const { urlBase64ToUint8Array } = await import("@/lib/utils/push");
      const appServerKey = urlBase64ToUint8Array(vapidKey);

      console.info("[push:enable] 5. VAPID key — length:", vapidKey.length,
        "| decoded bytes:", appServerKey.length,
        "| firstByte:", appServerKey[0]);

      if (appServerKey.length !== 65 || appServerKey[0] !== 4) {
        setNotifErr(
          `Clave VAPID inválida: ${appServerKey.length} bytes, primer byte: 0x${appServerKey[0]?.toString(16)}. ` +
          "Debe ser una clave P-256 sin comprimir (65 bytes, primer byte 0x04)."
        );
        return;
      }

      // Validate that the key is a genuine point on the P-256 curve.
      // A key can pass the byte-length check but still be rejected by FCM
      // if it's not a valid curve point — WebCrypto catches this.
      console.log("[push:enable] 5b. WebCrypto P-256 validation…");
      try {
        await crypto.subtle.importKey(
          "raw",
          appServerKey,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          []
        );
        console.log("[push:enable] 5b. WebCrypto OK — key is valid P-256 point");
      } catch (cryptoErr) {
        console.error("[push:enable] 5b. WebCrypto FAILED:", cryptoErr);
        setNotifErr(
          "La clave VAPID no es un punto P-256 válido. " +
          "Genera nuevas claves con: npx web-push generate-vapid-keys"
        );
        setNotifErrDetail(String(cryptoErr));
        return;
      }

      console.log("[push:enable] 6. getSubscription existente…");
      const existing = await reg.pushManager.getSubscription().catch(() => null);
      console.log("[push:enable] 7. existing sub:", existing ? existing.endpoint.substring(0, 50) + "…" : "ninguna");
      if (existing) {
        console.log("[push:enable] 8. unsubscribe existente…");
        await existing.unsubscribe().catch((e) => console.warn("[push:enable] unsubscribe error:", e));
      }

      console.log("[push:enable] 9. pushManager.subscribe()…");
      let sub;
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
        console.log("[push:enable] 10. subscribe OK:", sub.endpoint.substring(0, 60) + "…");
      } catch (subErr) {
        const name = subErr instanceof Error ? subErr.name : typeof subErr;
        const msg  = subErr instanceof Error ? subErr.message : String(subErr);
        const stack = subErr instanceof Error ? subErr.stack : undefined;
        console.error("[push:enable] subscribe FAILED:", { name, msg, stack, raw: subErr });
        throw subErr;
      }

      console.log("[push:enable] 11. POST /api/push/subscribe…");
      const res = await fetch("/api/push/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(sub.toJSON()),
      });
      console.log("[push:enable] 12. subscribe API response:", res.status);
      if (res.ok) {
        setIsSubscribed(true);
      } else {
        setNotifErr("Error al guardar la suscripción. Intenta de nuevo.");
      }
    } catch (err) {
      console.error("[push:enable] CATCH:", err);
      const name = err instanceof Error ? err.name : "Error";
      const msg  = err instanceof Error ? err.message : String(err);
      setNotifErr("No se pudo activar. Intenta 'Reiniciar suscripción' más abajo.");
      setNotifErrDetail(`${name}: ${msg}`);
    } finally {
      setNotifLoading(false);
    }
  }

  // Hard reset: unregister all SWs, clear all push subs, re-register fresh
  async function resetAndSubscribe() {
    setNotifErr("");
    setNotifErrDetail("");
    setNotifLoading(true);
    try {
      console.log("[push:reset] 1. getRegistrations…");
      const regs = await navigator.serviceWorker.getRegistrations();
      console.log("[push:reset] 2. SWs encontrados:", regs.length);
      await Promise.all(regs.map(async (reg) => {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        console.log("[push:reset] unregister scope:", reg.scope, "sub:", !!sub);
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          await sub.unsubscribe().catch(() => {});
        }
        await reg.unregister().catch(() => {});
      }));
      setIsSubscribed(false);

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setNotifErr("Clave VAPID no configurada."); return; }

      console.log("[push:reset] 3. register /sw.js…");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[push:reset] 4. reg OK, active:", reg.active?.state, "waiting:", reg.waiting?.state, "installing:", reg.installing?.state);

      await new Promise<void>((resolve) => {
        if (reg.active) { resolve(); return; }
        const sw = reg.installing ?? reg.waiting;
        if (!sw) { resolve(); return; }
        sw.addEventListener("statechange", function handler() {
          console.log("[push:reset] SW state →", sw.state);
          if (sw.state === "activated") { sw.removeEventListener("statechange", handler); resolve(); }
        });
        setTimeout(resolve, 5000);
      });
      console.log("[push:reset] 5. SW activado. active:", reg.active?.state);

      const { urlBase64ToUint8Array } = await import("@/lib/utils/push");
      const appServerKey = urlBase64ToUint8Array(vapidKey);
      console.log("[push:reset] 6. pushManager.subscribe()… key length:", appServerKey.length, "firstByte:", appServerKey[0]);

      let sub;
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
        console.log("[push:reset] 7. subscribe OK:", sub.endpoint.substring(0, 60) + "…");
      } catch (subErr) {
        const name = subErr instanceof Error ? subErr.name : typeof subErr;
        const msg  = subErr instanceof Error ? subErr.message : String(subErr);
        const stack = subErr instanceof Error ? subErr.stack : undefined;
        console.error("[push:reset] subscribe FAILED:", { name, msg, stack, raw: subErr });
        throw subErr;
      }

      console.log("[push:reset] 8. POST /api/push/subscribe…");
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      console.log("[push:reset] 9. API response:", res.status);
      if (res.ok) {
        setIsSubscribed(true);
        setSwReady(true);
      } else {
        setNotifErr("Suscripción creada pero no se pudo guardar en el servidor.");
      }
    } catch (err) {
      console.error("[push:reset] CATCH:", err);
      const name = err instanceof Error ? err.name : "Error";
      const msg  = err instanceof Error ? err.message : String(err);
      setNotifErr("Reset falló. Limpia los datos del sitio en ajustes del navegador.");
      setNotifErrDetail(`${name}: ${msg}`);
    } finally {
      setNotifLoading(false);
    }
  }

  async function disableNotifications() {
    setNotifErr("");
    setNotifLoading(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        if (!sub) continue;
        await fetch("/api/push/subscribe", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      setNotifErr(err instanceof Error ? err.message : "Error al desactivar notificaciones");
      console.error("[disableNotifications]", err);
    } finally {
      setNotifLoading(false);
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────────────
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem("spendlab-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  function applyTheme(t: "light" | "dark") {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("spendlab-theme", t); } catch {}
    setCurrentTheme(t);
  }

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const [isPendingSignOut, startSignOutTransition] = useTransition();

  function handleSignOut() {
    startSignOutTransition(() => signOut());
  }

  // ── Delete account ────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isPendingDelete, startDeleteTransition] = useTransition();

  const closeDelete = useCallback(() => {
    if (isPendingDelete) return;
    setDeleteOpen(false);
    setDeleteError("");
  }, [isPendingDelete]);

  useEffect(() => {
    if (!deleteOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDelete(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteOpen, closeDelete]);

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteAccount();
      if (result?.error) setDeleteError(result.error);
    });
  }

  // ── Balance variant ──────────────────────────────────────────────────────────
  const netVariant =
    stats.netBalance === 0 ? "neutral" : stats.netBalance > 0 ? "positive" : "negative";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.content}>

        {/* Avatar + identity */}
        <div className={styles.identitySection}>
          <div className={styles.avatar}>{initials(displayName)}</div>
          {editing ? (
            <div className={styles.nameEditRow}>
              <input
                ref={nameInputRef}
                className={styles.nameInput}
                type="text"
                value={nameValue}
                maxLength={60}
                disabled={isPendingName}
                onChange={(e) => { setNameValue(e.target.value); if (nameError) setNameError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  saveName();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              {nameError && <p className={styles.fieldError}>{nameError}</p>}
              <div className={styles.nameActions}>
                <button className={styles.nameCancel} onClick={cancelEdit} disabled={isPendingName}>Cancelar</button>
                <button className={styles.nameSave} onClick={saveName} disabled={isPendingName || !nameValue.trim()}>
                  {isPendingName ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.displayName}>{displayName}</p>
              <p className={styles.email}>{email}</p>
            </>
          )}
        </div>

        {/* Stats 2×2 */}
        <p className={styles.sectionLabel} style={{ marginBottom: "0.625rem" }}>Resumen total</p>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total pagado</p>
            <p className={styles.statValue}>{formatCLP(stats.totalPaid)}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Gastos registrados</p>
            <p className={styles.statValue}>{stats.totalExpenses}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Grupos activos</p>
            <p className={styles.statValue}>{stats.activeGroups}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Balance neto</p>
            <p className={`${styles.statValue} ${styles[`stat${netVariant.charAt(0).toUpperCase() + netVariant.slice(1)}`]}`}>
              {stats.netBalance === 0
                ? "$0"
                : stats.netBalance > 0
                ? `+${formatCLP(stats.netBalance)}`
                : formatCLP(stats.netBalance)}
            </p>
          </div>
        </div>

        {/* Apariencia */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Apariencia</p>
          <div className={styles.themeToggle}>
            <button className={`${styles.themeBtn} ${currentTheme === "light" ? styles.themeBtnActive : ""}`} onClick={() => applyTheme("light")}>Claro</button>
            <button className={`${styles.themeBtn} ${currentTheme === "dark"  ? styles.themeBtnActive : ""}`} onClick={() => applyTheme("dark")}>Oscuro</button>
          </div>
        </section>

        {/* Notificaciones */}
        {notifSupported && (
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Notificaciones</p>
            <div className={styles.accountList}>
              <div className={styles.notifRow}>
                <div className={styles.rowIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className={styles.notifInfo}>
                  <span className={styles.rowLabel}>Notificaciones push</span>
                  <span className={styles.notifStatus}>
                    {swReady === null        ? "Iniciando…"
                      : notifPermission === "denied"  ? "Bloqueadas por el navegador"
                      : isSubscribed                  ? "Activadas"
                      :                                 "Desactivadas"}
                  </span>
                </div>
                {swReady === null ? null
                  : notifPermission === "denied" ? (
                    <span className={styles.notifDenied}>Activar en ajustes del navegador</span>
                  ) : isSubscribed ? (
                    <button className={styles.notifBtnOff} onClick={disableNotifications} disabled={notifLoading}>
                      {notifLoading ? "…" : "Desactivar"}
                    </button>
                  ) : (
                    <button className={styles.notifBtnOn} onClick={enableNotifications} disabled={notifLoading}>
                      {notifLoading ? "…" : "Activar"}
                    </button>
                  )}
              </div>
              {notifErr && (
                <div>
                  <p className={styles.notifError}>{notifErr}</p>
                  {notifErrDetail && (
                    <p className={styles.notifErrDetail}>{notifErrDetail}</p>
                  )}
                  {notifPermission === "granted" && (
                    <button
                      className={styles.notifBtnReset}
                      onClick={resetAndSubscribe}
                      disabled={notifLoading}
                    >
                      {notifLoading ? "Reiniciando…" : "Reiniciar suscripción"}
                    </button>
                  )}
                </div>
              )}
              {/* ── Diagnóstico temporal ── */}
              <div style={{ marginTop: "0.75rem" }}>
                <button
                  onClick={runDiagnostic}
                  disabled={diagLoading}
                  style={{ fontSize: "0.7rem", opacity: 0.5, cursor: "pointer", background: "none", border: "1px solid currentColor", borderRadius: "4px", padding: "2px 8px", color: "inherit" }}
                >
                  {diagLoading ? "Diagnosticando…" : "Diagnóstico push"}
                </button>
                {diagInfo && (
                  <pre style={{ marginTop: "0.5rem", fontSize: "0.65rem", opacity: 0.7, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.2)", padding: "0.5rem", borderRadius: "4px" }}>
                    {diagInfo}
                  </pre>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Seguridad — passkeys (oculto en modo password local) */}
        {passkeySupported && process.env.NEXT_PUBLIC_ENABLE_PASSWORD_AUTH !== "true" && (
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Seguridad</p>
            <div className={styles.accountList}>
              <Link href="/profile/passkeys" className={styles.accountRow}>
                <div className={styles.rowIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 10a2 2 0 0 0-2 2c0 1.7 1.08 3.15 2.6 3.68" />
                    <path d="M12 6a6 6 0 0 1 6 6c0 1.37-.45 2.63-1.2 3.65" />
                    <path d="M12 6a6 6 0 0 0-6 6c0 3.31 2.69 6 6 6" />
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07" />
                    <path d="M12 2c5.52 0 10 4.48 10 10 0 1.45-.31 2.82-.86 4.06" />
                  </svg>
                </div>
                <span className={styles.rowLabel}>Passkeys</span>
                <span className={styles.rowBadge}>
                  {passkeyCount === 0 ? "Ninguna" : passkeyCount === 1 ? "1 dispositivo" : `${passkeyCount} dispositivos`}
                </span>
                <svg className={styles.rowChevron} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </section>
        )}

        {/* Cuenta */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Cuenta</p>
          <div className={styles.accountList}>
            <button
              className={styles.accountRow}
              onClick={() => { if (!editing) { setNameValue(displayName); setEditing(true); } }}
            >
              <div className={styles.rowIcon}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M13 2.5a1.414 1.414 0 0 1 2 2L5.5 14 2 15l1-3.5L13 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className={styles.rowLabel}>Editar nombre</span>
              <svg className={styles.rowChevron} width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className={styles.accountRow} onClick={handleSignOut} disabled={isPendingSignOut}>
              <div className={styles.rowIcon}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M12 12l4-4-4-4M16 8H7M10 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className={styles.rowLabel}>{isPendingSignOut ? "Cerrando sesión…" : "Cerrar sesión"}</span>
              <svg className={styles.rowChevron} width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </section>

        <button className={styles.deleteBtn} onClick={() => setDeleteOpen(true)}>
          Eliminar cuenta
        </button>
      </div>

      {/* Delete modal */}
      {deleteOpen && (
        <div className={styles.backdrop} onClick={closeDelete} role="dialog" aria-modal="true" aria-label="Confirmar eliminación de cuenta">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>¿Eliminar cuenta?</p>
            <p className={styles.modalBody}>
              Esta acción es irreversible. Se eliminarán todos tus datos, grupos y gastos asociados a esta cuenta.
            </p>
            {deleteError && <p className={styles.modalError}>{deleteError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={closeDelete} disabled={isPendingDelete}>Cancelar</button>
              <button className={styles.btnDelete} onClick={handleDelete} disabled={isPendingDelete}>
                {isPendingDelete ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
