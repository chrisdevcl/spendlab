"use client";

import { formatCLP } from "@/lib/utils/currency";
import styles from "./balance-card.module.css";

interface BalanceCardProps {
  selectedMonth: string;
  availableMonths: string[];
  showPicker: boolean;
  onMonthChange: (month: string) => void;
  monthLabel: (key: string) => string;
  expenseCount: number;
  totalAmount: number;
  debes: number;
  teDeben: number;
  onOpenDebtList?: () => void;
}

export default function BalanceCard({
  selectedMonth,
  availableMonths,
  showPicker,
  onMonthChange,
  monthLabel,
  expenseCount,
  totalAmount,
  debes,
  teDeben,
  onOpenDebtList,
}: BalanceCardProps) {
  return (
    <div className={styles.card}>
      {/* Top row: month pill */}
      <div className={styles.topRow}>
        {showPicker ? (
          <div className={styles.monthPill}>
            <span className={styles.monthPillLabel}>{monthLabel(selectedMonth)}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <select
              className={styles.monthSelectOverlay}
              value={selectedMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              aria-label="Seleccionar mes"
            >
              {availableMonths.map((key) => (
                <option key={key} value={key}>{monthLabel(key)}</option>
              ))}
            </select>
          </div>
        ) : (
          <span className={styles.monthPillStatic}>{monthLabel(selectedMonth)}</span>
        )}
      </div>

      {/* Large amount */}
      <span className={styles.label}>TOTAL DEL MES ({expenseCount} {expenseCount === 1 ? "GASTO" : "GASTOS"})</span>
      <p className={styles.amount}>{formatCLP(totalAmount)}</p>

      {/* Divider + DEBES / TE DEBEN */}
      <div className={styles.dividerLine} />
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.label}>DEBES</span>
          <span className={styles.statValue}>{formatCLP(debes)}</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.label}>TE DEBEN</span>
          <span className={styles.statValue}>{formatCLP(teDeben)}</span>
        </div>
      </div>

      {/* Ver detalle */}
      {onOpenDebtList && (
        <button className={styles.detailBtn} onClick={onOpenDebtList}>
          Ver detalle
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
