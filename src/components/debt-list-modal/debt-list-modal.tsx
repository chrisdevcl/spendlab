"use client";

import { useEffect } from "react";
import { formatCLP } from "@/lib/utils/currency";
import styles from "./debt-list-modal.module.css";

export interface DebtListItem {
  id: string;
  name: string;
  amount: number;
  toUserId: string;
}

export interface CreditListItem {
  id: string;
  name: string;
  amount: number;
}

interface DebtListModalProps {
  open: boolean;
  onClose: () => void;
  items: DebtListItem[];
  creditItems?: CreditListItem[];
  onPay: (item: DebtListItem) => void;
  onPayAll?: () => void;
}

export default function DebtListModal({ open, onClose, items, creditItems = [], onPay, onPayAll }: DebtListModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de deudas"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>Detalle de deudas</p>

        {creditItems.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>TE DEBEN</p>
            <div className={styles.list}>
              {creditItems.map((item) => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.rowName}>{item.name}</span>
                  <span className={styles.rowAmountPositive}>{formatCLP(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          {creditItems.length > 0 && <p className={styles.sectionLabel}>DEBES</p>}
          {items.length === 0 ? (
            <p className={styles.empty}>No tienes deudas pendientes.</p>
          ) : (
            <div className={styles.list}>
              {items.map((item) => (
                <div key={item.id} className={styles.row}>
                  <div className={styles.rowInfo}>
                    <span className={styles.rowName}>{item.name}</span>
                    <span className={styles.rowAmount}>{formatCLP(item.amount)}</span>
                  </div>
                  <button className={styles.payBtn} onClick={() => onPay(item)}>
                    Registrar pago
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 1 && onPayAll && (
          <button className={styles.payAllBtn} onClick={onPayAll}>
            Pagar todo · {formatCLP(total)}
          </button>
        )}
        <button className={styles.closeBtn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
