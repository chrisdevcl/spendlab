"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ExpenseWithDetails, GlobalBalance } from "@/types";
import type { Settlement } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import styles from "./activity-list.module.css";

interface Props {
  expenses: ExpenseWithDetails[];
  settlements: Settlement[];
  globalBalance: GlobalBalance; // all-time debts, pre-enriched with profiles
  userId: string;
}

function firstWord(name: string): string {
  return name?.split(" ")[0] ?? name;
}

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date  = new Date(y, m - 1, 1);
  const month = date.toLocaleDateString("es-CL", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`;
}

// Group a flat list of expenses by date label
function groupByDate(
  expenses: ExpenseWithDetails[]
): { label: string; expenses: ExpenseWithDetails[] }[] {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const ordered: string[] = [];
  const map = new Map<string, ExpenseWithDetails[]>();

  for (const expense of expenses) {
    const date = expense.expense_date;
    let label: string;

    if (date === today) {
      label = "Hoy";
    } else if (date === yesterday) {
      label = "Ayer";
    } else if (date > weekStart) {
      label = "Esta semana";
    } else {
      const d = new Date(`${date}T12:00:00`);
      const raw = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      label = raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    if (!map.has(label)) {
      ordered.push(label);
      map.set(label, []);
    }
    map.get(label)!.push(expense);
  }

  return ordered.map((label) => ({ label, expenses: map.get(label)! }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityList({ expenses, globalBalance, userId }: Props) {
  const { debts } = globalBalance;
  const [debtExpanded, setDebtExpanded] = useState(false);

  // ── Month picker ────────────────────────────────────────────────────────────
  const currentMonthKey = toMonthKey(new Date());

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    expenses.forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, currentMonthKey]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const showPicker = availableMonths.length > 1;

  // ── Filtered + grouped expenses ─────────────────────────────────────────────
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === selectedMonth),
    [expenses, selectedMonth]
  );

  const groups = useMemo(() => groupByDate(filteredExpenses), [filteredExpenses]);

  // Monthly totals
  const totalExpenses = filteredExpenses.length;
  const totalAmount   = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  // All-time debts
  const iOwe    = debts.filter((d) => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
  const theyOwe = debts.filter((d) => d.toUserId   === userId).reduce((s, d) => s + d.amount, 0);

  return (
    <div className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h1 className={styles.heading}>Actividad</h1>
      </header>

      <div className={styles.content}>
        {/* ── Global balance card ──────────────────────────────────────── */}
        <button
          className={styles.balanceCard}
          onClick={() => debts.length > 0 && setDebtExpanded((p) => !p)}
          aria-expanded={debtExpanded}
        >
          <div className={styles.balanceHeader}>
            <p className={styles.balanceEyebrow}>
              {totalExpenses} {totalExpenses === 1 ? "gasto" : "gastos"} · {formatCLP(totalAmount)}
            </p>
            {debts.length > 0 && (
              <svg
                className={`${styles.chevron} ${debtExpanded ? styles.chevronUp : ""}`}
                width="16" height="16" viewBox="0 0 16 16" fill="none"
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {(iOwe > 0 || theyOwe > 0) && (
            <div className={styles.balanceRow}>
              {iOwe > 0 && (
                <div className={styles.balanceStat}>
                  <span className={styles.balanceStatLabel}>Debes</span>
                  <span className={styles.balanceStatValue}>{formatCLP(iOwe)}</span>
                </div>
              )}
              {theyOwe > 0 && (
                <div className={styles.balanceStat}>
                  <span className={styles.balanceStatLabel}>Te deben</span>
                  <span className={styles.balanceStatValue}>{formatCLP(theyOwe)}</span>
                </div>
              )}
            </div>
          )}

          {debtExpanded && debts.length > 0 && (
            <div className={styles.debtBreakdown}>
              <div className={styles.debtDivider} />
              {debts.map((debt, i) => {
                const fromName = firstWord(debt.fromProfile?.display_name ?? debt.fromUserId);
                const toName   = firstWord(debt.toProfile?.display_name   ?? debt.toUserId);
                return (
                  <div key={i} className={styles.debtItem}>
                    <span className={styles.debtItemNames}>{fromName} → {toName}</span>
                    <span className={styles.debtItemAmount}>{formatCLP(debt.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </button>

        {/* ── Month picker ─────────────────────────────────────────────── */}
        {showPicker && (
          <div className={styles.monthPicker}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={styles.monthIcon} aria-hidden="true">
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5 1v3M11 1v3M2 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <div className={styles.monthSelectWrap}>
              <span className={styles.monthSelectLabel}>{monthLabel(selectedMonth)}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.monthChevron} aria-hidden="true">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <select
                className={styles.monthSelectOverlay}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Seleccionar mes"
              >
                {availableMonths.map((key) => (
                  <option key={key} value={key}>{monthLabel(key)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── Expense list ─────────────────────────────────────────────── */}
        {totalExpenses === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>🧾</p>
            <p className={styles.emptyTitle}>
              {selectedMonth === currentMonthKey ? "Sin gastos todavía" : "Sin gastos este mes"}
            </p>
            <p className={styles.emptyBody}>
              {selectedMonth === currentMonthKey
                ? "Los gastos de tus grupos aparecerán aquí."
                : "No hubo gastos registrados en este período."}
            </p>
          </div>
        ) : (
          groups.map(({ label, expenses: groupExpenses }) => (
            <section key={label} className={styles.group}>
              <p className={styles.groupLabel}>{label}</p>
              <div className={styles.expenseList}>
                {groupExpenses.map((expense) => (
                  <ExpenseRow key={expense.id} expense={expense} userId={userId} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense, userId }: { expense: ExpenseWithDetails; userId: string }) {
  const myShare = expense.splits.find((s) => s.user_id === userId)?.amount;

  const rightMeta =
    expense.paid_by === userId
      ? "pagaste tú"
      : myShare != null
      ? `tu parte ${formatCLP(myShare)}`
      : `pagó ${firstWord(expense.payer?.display_name ?? "")}`;

  return (
    <Link href={`/activity/${expense.id}`} className={styles.expenseRow}>
      <div className={styles.expenseLeft}>
        <p className={styles.expenseDesc}>{expense.description}</p>
        <span className={styles.groupBadge}>{expense.group.name}</span>
      </div>
      <div className={styles.expenseRight}>
        <div className={styles.expenseAmountRow}>
          <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
          <svg className={styles.expenseChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className={styles.expenseRightMeta}>{rightMeta}</p>
      </div>
    </Link>
  );
}
