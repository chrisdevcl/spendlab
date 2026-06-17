"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/app/(app)/groups/actions";
import styles from "./modals.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewGroupModal({ open, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setName("");
      setError("");
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createGroup(trimmed);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={() => { if (!isPending) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo grupo"
    >
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <p className={styles.title}>Nuevo grupo</p>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
            disabled={isPending}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Nombre del grupo"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            maxLength={60}
            disabled={isPending}
          />
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.inputActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnSubmit}
              disabled={isPending || !name.trim()}
            >
              {isPending ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
