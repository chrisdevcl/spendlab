"use client";

import { useEffect } from "react";
import Link from "next/link";
import styles from "./modals.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  groups: { id: string; name: string }[];
}

export function GroupPickerModal({ open, onClose, groups }: Props) {
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
      aria-label="Seleccionar grupo"
    >
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <p className={styles.title}>¿A qué grupo añadir el gasto?</p>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {groups.map((g) => (
          <Link
            key={g.id}
            href={`/groups/${g.id}/expenses/new`}
            className={styles.pickerItem}
            onClick={onClose}
          >
            <span className={styles.groupAvatar}>{g.name[0]?.toUpperCase() ?? "G"}</span>
            {g.name}
          </Link>
        ))}
        <div className={styles.pickerDivider} />
        <button className={styles.pickerCancel} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
