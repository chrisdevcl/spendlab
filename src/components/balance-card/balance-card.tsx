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
  countSuffix?: string;                               // default "GASTO" → "GASTOS"
  debtLabel?: string;                                 // shown below amount when provided
  debtSign?: "positive" | "negative" | "neutral";    // chip color
}

export default function BalanceCard({
  selectedMonth,
  availableMonths,
  showPicker,
  onMonthChange,
  monthLabel,
  expenseCount,
  totalAmount,
  countSuffix = "GASTO",
  debtLabel,
  debtSign,
}: BalanceCardProps) {
  const suffix = expenseCount === 1 ? countSuffix : countSuffix + "S";

  const debtChipClass =
    debtSign === "positive" ? styles.debtChipPos :
    debtSign === "negative" ? styles.debtChipNeg :
    styles.debtChipNeutral;

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

      <span className={styles.label}>TOTAL DEL MES</span>
      <span className={styles.countChip}>{expenseCount} {suffix}</span>
      <p className={styles.amount}>{formatCLP(totalAmount)}</p>

      {debtLabel && (
        <span className={`${styles.debtChip} ${debtChipClass}`}>
          <span className={styles.debtDot} />
          {debtLabel}
        </span>
      )}
    </div>
  );
}
