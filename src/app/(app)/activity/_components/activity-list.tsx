"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExpenseWithDetails, GlobalBalance } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import type { DateGroup } from "../page";
import styles from "./activity-list.module.css";

interface Props {
  groups: DateGroup[];
  globalBalance: GlobalBalance;
  userId: string;
}

function firstWord(name: string): string {
  return name?.split(" ")[0] ?? name;
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityList({ groups, globalBalance, userId }: Props) {
  const { debts } = globalBalance;
  const [debtExpanded, setDebtExpanded] = useState(false);

  const totalExpenses = groups.reduce((sum, g) => sum + g.expenses.length, 0);
  const totalAmount = groups.reduce((sum, g) => sum + g.expenses.reduce((s, e) => s + e.amount, 0), 0);

  const iOwe = debts.filter((d) => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
  const theyOwe = debts.filter((d) => d.toUserId === userId).reduce((s, d) => s + d.amount, 0);

  // Current month label
  const monthLabel = new Date().toLocaleDateString("es-CL", { month: "long" }).toUpperCase();

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
              {monthLabel} · {totalExpenses} {totalExpenses === 1 ? "gasto" : "gastos"}
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
          <p className={styles.balanceAmount}>{formatCLP(totalAmount)}</p>

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

          {/* Expanded debt breakdown */}
          {debtExpanded && debts.length > 0 && (
            <div className={styles.debtBreakdown}>
              <div className={styles.debtDivider} />
              {debts.map((debt, i) => {
                const fromName = firstWord(debt.fromProfile?.display_name ?? debt.fromUserId);
                const toName = firstWord(debt.toProfile?.display_name ?? debt.toUserId);
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

        {/* ── Expense groups ───────────────────────────────────────────── */}
        {totalExpenses === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>🧾</p>
            <p className={styles.emptyTitle}>Sin gastos todavía</p>
            <p className={styles.emptyBody}>
              Los gastos de tus grupos aparecerán aquí.
            </p>
          </div>
        ) : (
          groups.map(({ label, expenses }) => (
            <section key={label} className={styles.group}>
              <p className={styles.groupLabel}>{label}</p>
              <div className={styles.expenseList}>
                {expenses.map((expense) => (
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

function ExpenseRow({
  expense,
  userId,
}: {
  expense: ExpenseWithDetails;
  userId: string;
}) {
  const myShare = expense.splits.find((s) => s.user_id === userId)?.amount;

  // Right-side meta: who paid / what's your share
  const rightMeta =
    expense.paid_by === userId
      ? "pagaste tú"
      : myShare != null
      ? `tu parte ${formatCLP(myShare)}`
      : `pagó ${firstWord(expense.payer?.display_name ?? "")}`;

  return (
    <Link href={`/activity/${expense.id}`} className={styles.expenseRow}>
      {/* Left: description + group badge */}
      <div className={styles.expenseLeft}>
        <p className={styles.expenseDesc}>{expense.description}</p>
        <span className={styles.groupBadge}>{expense.group.name}</span>
      </div>
      {/* Right: amount+chevron / meta */}
      <div className={styles.expenseRight}>
        <div className={styles.expenseAmountRow}>
          <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
          <svg
            className={styles.expenseChevron}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <path
              d="M5 2.5l4.5 4.5L5 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className={styles.expenseRightMeta}>{rightMeta}</p>
      </div>
    </Link>
  );
}
