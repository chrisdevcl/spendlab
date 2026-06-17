"use client";

import { useEffect } from "react";
import styles from "./modals.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  isEmpty: boolean;
  children?: React.ReactNode;
}

export function NotificationsModal({ open, onClose, isEmpty, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Notificaciones"
    >
      <div className={styles.sheetScroll} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <p className={styles.title}>Notificaciones</p>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {isEmpty ? (
          <p className={styles.empty}>Sin notificaciones pendientes.</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
