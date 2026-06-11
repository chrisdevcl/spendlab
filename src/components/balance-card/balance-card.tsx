"use client";

import { formatCLP } from "@/lib/utils/currency";
import styles from "./balance-card.module.css";

export interface DebtBreakdownEntry {
  fromName: string;
  toName: string;
  amount: number;
}

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
  debts?: DebtBreakdownEntry[];
  expanded?: boolean;
  onToggleExpand?: () => void;
  onRegisterPago?: () => void;
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
  debts,
  expanded = false,
  onToggleExpand,
  onRegisterPago,
}: BalanceCardProps) {
  const expandable = !!onToggleExpand && !!debts && debts.length > 1;

  return (
    <div className={styles.card} onClick={expandable ? onToggleExpand : undefined}>
      {/* Top row: month pill + chevron */}
      <div className={styles.topRow}>
        {showPicker ? (
          <div className={styles.monthPill} onClick={(e) => e.stopPropagation()}>
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
        {expandable && (
          <svg
            className={`${styles.chevron} ${expanded ? styles.chevronUp : ""}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
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
        <div className={styles.stat}>
          <span className={styles.label}>TE DEBEN</span>
          <span className={styles.statValue}>{formatCLP(teDeben)}</span>
        </div>
      </div>

      {/* Expanded debt breakdown */}
      {expanded && debts && debts.length > 0 && (
        <div className={styles.breakdown}>
          <div className={styles.divider} />
          {debts.map((debt, i) => (
            <div key={i} className={styles.breakdownRow}>
              <span className={styles.breakdownNames}>{debt.fromName} → {debt.toName}</span>
              <span className={styles.breakdownAmount}>{formatCLP(debt.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Registrar pago */}
      {onRegisterPago && (
        <button
          className={styles.registerBtn}
          onClick={(e) => { e.stopPropagation(); onRegisterPago(); }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Registrar pago
        </button>
      )}
    </div>
  );
}
