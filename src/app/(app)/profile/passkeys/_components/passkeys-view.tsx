"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PasskeyItem } from "../../page";
import styles from "./passkeys-view.module.css";

interface Props {
  passkeys: PasskeyItem[];
}

function autoLabel(pk: PasskeyItem): string {
  if (pk.backed_up) return "Passkey sincronizada";
  if ((pk.transports ?? []).includes("internal")) return "Passkey de dispositivo";
  return "Passkey";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PasskeysView({ passkeys: initial }: Props) {
  const router = useRouter();
  const [errMsg, setErrMsg] = useState("");

  // Optimistic local mutations — derived list stays in sync with server data
  // automatically when router.refresh() delivers new props from the server.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [renames, setRenames] = useState<Record<string, string | null>>({});

  const passkeys = initial
    .filter((p) => !deletedIds.has(p.id))
    .map((p) => (p.id in renames ? { ...p, nickname: renames[p.id] } : p));

  // ── Add passkey ─────────────────────────────────────────────────────────
  const [adding, startAddTransition] = useTransition();
  const [addMsg, setAddMsg] = useState("");
  const [addError, setAddError] = useState(false);

  function showMsg(msg: string, isError = false) {
    setAddMsg(msg);
    setAddError(isError);
    setTimeout(() => { setAddMsg(""); setAddError(false); }, 4000);
  }

  function handleAdd() {
    startAddTransition(async () => {
      const beginRes = await fetch("/api/passkey/register/begin", { method: "POST" });
      if (!beginRes.ok) {
        const d = await beginRes.json().catch(() => ({}));
        showMsg(d.error ?? "Error al registrar passkey", true);
        return;
      }
      const options = await beginRes.json();

      let credential;
      try {
        const { startRegistration } = await import("@simplewebauthn/browser");
        credential = await startRegistration({ optionsJSON: options });
      } catch (err) {
        const name = (err as Error).name;
        if (name === "InvalidStateError") showMsg("Este dispositivo ya tiene una passkey registrada");
        else if (name !== "NotAllowedError") showMsg("Error al registrar passkey", true);
        return;
      }

      const finishRes = await fetch("/api/passkey/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      const data = await finishRes.json();
      if (!finishRes.ok || data.error) {
        showMsg(data.error ?? "Error al registrar passkey", true);
        return;
      }

      showMsg("Passkey añadida correctamente");
      router.refresh();
    });
  }

  // ── Delete passkey ──────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (passkeys.length <= 1) {
      setErrMsg("No puedes eliminar tu única passkey");
      setTimeout(() => setErrMsg(""), 4000);
      return;
    }
    setDeletingId(id);
    const res = await fetch(`/api/passkey/register/${id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (!res.ok || data.error) {
      setErrMsg(data.error ?? "Error al eliminar passkey");
      setTimeout(() => setErrMsg(""), 4000);
      return;
    }
    setDeletedIds((prev) => new Set([...prev, id]));
  }

  // ── Rename passkey ──────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, startRenameTransition] = useTransition();
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename(pk: PasskeyItem) {
    setRenamingId(pk.id);
    setRenameValue(pk.nickname ?? "");
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 40);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  function saveRename(id: string) {
    startRenameTransition(async () => {
      const res = await fetch(`/api/passkey/register/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: renameValue }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setErrMsg(data.error ?? "Error al renombrar passkey");
        setTimeout(() => setErrMsg(""), 4000);
        return;
      }
      const trimmed = renameValue.trim() || null;
      setRenames((prev) => ({ ...prev, [id]: trimmed }));
      setRenamingId(null);
    });
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className={styles.title}>Passkeys</h1>
      </header>

      <div className={styles.content}>
        {/* Error message */}
        {errMsg && <p className={styles.errorBanner}>{errMsg}</p>}

        {/* Empty state */}
        {passkeys.length === 0 && (
          <p className={styles.empty}>No tienes passkeys registradas.</p>
        )}

        {/* Passkey list */}
        {passkeys.length > 0 && (
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Dispositivos registrados</p>
            <ul className={styles.list}>
              {passkeys.map((pk) => (
                <li key={pk.id} className={styles.item}>
                  {renamingId === pk.id ? (
                    /* ── Rename mode ── */
                    <div className={styles.renameRow}>
                      <input
                        ref={renameInputRef}
                        className={styles.renameInput}
                        type="text"
                        value={renameValue}
                        maxLength={60}
                        placeholder={autoLabel(pk)}
                        disabled={renamePending}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(pk.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                      />
                      <div className={styles.renameActions}>
                        <button className={styles.btnCancel} onClick={cancelRename} disabled={renamePending}>
                          Cancelar
                        </button>
                        <button className={styles.btnSave} onClick={() => saveRename(pk.id)} disabled={renamePending}>
                          {renamePending ? "…" : "Guardar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div className={styles.row}>
                      <div className={styles.icon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                          <path d="M12 10a2 2 0 0 0-2 2c0 1.7 1.08 3.15 2.6 3.68" />
                          <path d="M12 6a6 6 0 0 1 6 6c0 1.37-.45 2.63-1.2 3.65" />
                          <path d="M12 6a6 6 0 0 0-6 6c0 3.31 2.69 6 6 6" />
                          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07" />
                          <path d="M12 2c5.52 0 10 4.48 10 10 0 1.45-.31 2.82-.86 4.06" />
                        </svg>
                      </div>
                      <div className={styles.info}>
                        <span className={styles.name}>{pk.nickname || autoLabel(pk)}</span>
                        <span className={styles.meta}>
                          {pk.backed_up ? "Sincronizada · " : "Solo este dispositivo · "}
                          Añadida el {formatDate(pk.created_at)}
                        </span>
                      </div>
                      <div className={styles.actions}>
                        <button
                          className={styles.btnIcon}
                          onClick={() => startRename(pk)}
                          aria-label="Renombrar"
                          title="Renombrar"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L4.5 13 2 14l1-2.5 8.5-9Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          className={`${styles.btnIcon} ${styles.btnDanger}`}
                          onClick={() => handleDelete(pk.id)}
                          disabled={deletingId === pk.id}
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          {deletingId === pk.id ? "…" : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M3 4h10M6 4V2.5h4V4M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Add passkey */}
        <section className={styles.section}>
          {addMsg && (
            <p className={addError ? styles.addMsgError : styles.addMsg}>{addMsg}</p>
          )}
          <button className={styles.btnAdd} onClick={handleAdd} disabled={adding}>
            {adding ? (
              <span className={styles.spinner} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 4v10M4 9h10" />
              </svg>
            )}
            {adding ? "Registrando…" : "Añadir passkey"}
          </button>
        </section>
      </div>
    </div>
  );
}
