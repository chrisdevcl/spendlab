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
  // null = still checking, true/false = resolved
  const [swReady, setSwReady]               = useState<boolean | null>(
    notifSupported ? null : false
  );

  // Detect SW registration and existing subscription on mount.
  // controllerchange fires when SW finishes installing → re-check.
  useEffect(() => {
    if (!notifSupported) return;

    async function syncSwState() {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        setSwReady(regs.length > 0);
        for (const reg of regs) {
          const sub = await reg.pushManager.getSubscription().catch(() => null);
          if (sub) { setIsSubscribed(true); return; }
        }
      } catch {
        setSwReady(false);
      }
    }

    syncSwState();
    navigator.serviceWorker.addEventListener("controllerchange", syncSwState);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", syncSwState);
    };
  }, [notifSupported]);

  async function getSwReg(): Promise<ServiceWorkerRegistration> {
    const regs  = await navigator.serviceWorker.getRegistrations();
    const found = regs.find((r) => r.active);
    return found ?? navigator.serviceWorker.ready;
  }

  async function enableNotifications() {
    setNotifErr("");
    setNotifLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== "granted") return;

      const reg = await getSwReg();
      let sub   = await reg.pushManager.getSubscription();
      if (!sub) {
        const { urlBase64ToUint8Array } = await import("@/lib/utils/push");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
      }
      const res = await fetch("/api/push/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(sub.toJSON()),
      });
      if (res.ok) {
        setIsSubscribed(true);
      } else {
        setNotifErr("Error al guardar suscripción");
      }
    } catch (err) {
      setNotifErr(err instanceof Error ? err.message : "Error al activar notificaciones");
      console.error("[enableNotifications]", err);
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
              {notifErr && <p className={styles.notifError}>{notifErr}</p>}
            </div>
          </section>
        )}

        {/* Seguridad — passkeys */}
        {passkeySupported && (
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
