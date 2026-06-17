"use client";

import { useEffect, useRef } from "react";
import { formatCLPInput } from "@/lib/utils/currency";
import styles from "./settlement-modal.module.css";

interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
  subtitle: string;
  amountRaw: string;
  onAmountChange: (digits: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  maxAmount: number;
  error: string;
  pending: boolean;
  onConfirm: () => void;
}

export default function SettlementModal({
  open,
  onClose,
  subtitle,
  amountRaw,
  onAmountChange,
  note,
  onNoteChange,
  maxAmount,
  error,
  pending,
  onConfirm,
}: SettlementModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.select(), 80);
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

  if (!open) return null;

  const amount = parseInt(amountRaw.replace(/\D/g, "") || "0", 10);

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <p className={styles.modalTitle}>Registrar pago</p>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar" disabled={pending}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <p className={styles.modalSub}>{subtitle}</p>
        <input
          ref={inputRef}
          className={styles.modalInput}
          type="text"
          inputMode="numeric"
          placeholder="Monto a pagar"
          value={amountRaw ? formatCLPInput(amountRaw) : ""}
          disabled={pending}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            const num = parseInt(digits || "0", 10);
            onAmountChange(num > maxAmount ? String(maxAmount) : digits);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
          }}
        />
        <input
          className={styles.modalInput}
          style={{ marginTop: "0.75rem" }}
          type="text"
          placeholder="Descripción (opcional)"
          value={note}
          disabled={pending}
          maxLength={120}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }}
        />
        {error && <p className={styles.modalError}>{error}</p>}
        <div className={styles.modalActions}>
          <button className={styles.btnCancel} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            className={styles.btnConfirm}
            onClick={onConfirm}
            disabled={pending || amount <= 0}
          >
            {pending ? "Registrando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
