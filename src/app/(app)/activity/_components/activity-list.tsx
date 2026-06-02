"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ExpenseWithDetails, GlobalBalance, PendingInvitation } from "@/types";
import type { Settlement } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import styles from "./activity-list.module.css";

interface Props {
  expenses: ExpenseWithDetails[];
  settlements: Settlement[];
  globalBalance: GlobalBalance;
  userId: string;
  invitations: PendingInvitation[];
}


type ExpenseStatus = "te-deben" | "debes" | "al-dia" | null;

function getExpenseStatus(
  expense: ExpenseWithDetails,
  settlements: Settlement[],
  userId: string
): ExpenseStatus {
  const userSplit = expense.splits.find((s) => s.user_id === userId);
  if (!userSplit || expense.splits.length <= 1) return null;

  const payerId = expense.paid_by;
  const groupSettlements = settlements.filter((s) => s.group_id === expense.group_id);

  if (payerId === userId) {
    const others = expense.splits.filter((s) => s.user_id !== userId);
    const allSettled = others.every((split) => {
      const paid = groupSettlements
        .filter((s) => s.paid_by === split.user_id && s.paid_to === userId)
        .reduce((sum, s) => sum + s.amount, 0);
      return paid >= split.amount;
    });
    return allSettled ? "al-dia" : "te-deben";
  } else {
    const paid = groupSettlements
      .filter((s) => s.paid_by === userId && s.paid_to === payerId)
      .reduce((sum, s) => sum + s.amount, 0);
    return paid >= userSplit.amount ? "al-dia" : "debes";
  }
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

// Group a flat list of expenses by exact date (DD/MM/AAAA)
function groupByDate(
  expenses: ExpenseWithDetails[]
): { label: string; expenses: ExpenseWithDetails[] }[] {
  const ordered: string[] = [];
  const map = new Map<string, ExpenseWithDetails[]>();

  for (const expense of expenses) {
    const [y, m, d] = expense.expense_date.slice(0, 10).split("-");
    const label = `${d}/${m}/${y}`;

    if (!map.has(label)) {
      ordered.push(label);
      map.set(label, []);
    }
    map.get(label)!.push(expense);
  }

  return ordered.map((label) => ({ label, expenses: map.get(label)! }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityList({ expenses, settlements, globalBalance, userId, invitations }: Props) {
  const { debts } = globalBalance;
  const [notifOpen, setNotifOpen] = useState(false);

  const [addHref, setAddHref] = useState("/groups");
  useEffect(() => {
    const id = localStorage.getItem("lastGroupId");
    if (id) setAddHref(`/groups/${id}/expenses/new`); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

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

  const hasMultiMemberGroups = useMemo(
    () => expenses.some((e) => e.splits.some((s) => s.user_id !== userId)),
    [expenses, userId]
  );

  return (
    <div className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h1 className={styles.heading}>Actividad</h1>
        <button
          className={styles.bellBtn}
          onClick={() => setNotifOpen(true)}
          aria-label={`Notificaciones${invitations.length > 0 ? ` · ${invitations.length}` : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1 5 1.5 5.5h-15C3 13 4 11.5 4 8a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {invitations.length > 0 && (
            <span className={styles.bellBadge}>{invitations.length}</span>
          )}
        </button>
      </header>

      <div className={styles.content}>
        {/* ── Balance card ──────────────────────────────────────────────── */}
        <div className={styles.balanceCard}>
          {/* Top row: month picker pill */}
          <div className={styles.balanceTopRow}>
            {showPicker ? (
              <div className={styles.monthPill}>
                <span className={styles.monthPillLabel}>{monthLabel(selectedMonth)}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
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
            ) : (
              <span className={styles.monthPillStatic}>{monthLabel(selectedMonth)}</span>
            )}
          </div>

          {/* Large amount */}
          <p className={styles.balanceAmount}>{formatCLP(totalAmount)}</p>
          <p className={styles.balanceEyebrow}>
            {totalExpenses} {totalExpenses === 1 ? "gasto" : "gastos"}
          </p>

          {/* DEBES / TE DEBEN row — siempre visible en grupos con múltiples integrantes */}
          {hasMultiMemberGroups && (
            <>
              <div className={styles.balanceDivider} />
              <div className={styles.balanceRow}>
                <div className={styles.balanceStat}>
                  <span className={styles.balanceStatLabel}>DEBES</span>
                  <span className={styles.balanceStatValue}>{formatCLP(iOwe)}</span>
                </div>
                <div className={styles.balanceStat}>
                  <span className={styles.balanceStatLabel}>TE DEBEN</span>
                  <span className={styles.balanceStatValue}>{formatCLP(theyOwe)}</span>
                </div>
              </div>
            </>
          )}

        </div>

        {/* ── Expense list ─────────────────────────────────────────────── */}
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Lista de gastos</span>
          <Link href={addHref} className={styles.addBtn}>+ Añadir</Link>
        </div>

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
                  <ExpenseRow key={expense.id} expense={expense} settlements={settlements} userId={userId} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* ── Notifications bottom sheet ────────────────────────────────── */}
      {notifOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setNotifOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Notificaciones"
        >
          <div className={styles.notifSheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.notifTitle}>Notificaciones</p>
            {invitations.length > 0 ? (
              <>
                <p className={styles.notifSubLabel}>INVITACIONES · {invitations.length}</p>
                {invitations.map((inv) => (
                  <div key={inv.id} className={styles.invCard}>
                    <p className={styles.invGroupName}>{inv.group_name}</p>
                    <p className={styles.invMeta}>
                      Te invitó {inv.inviter_name} · {inv.member_count === 1 ? "1 integrante" : `${inv.member_count} integrantes`}
                    </p>
                    <Link href="/groups" className={styles.invLink} onClick={() => setNotifOpen(false)}>
                      Ver en Grupos →
                    </Link>
                  </div>
                ))}
              </>
            ) : (
              <p className={styles.notifEmpty}>Sin notificaciones pendientes.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense, settlements, userId }: { expense: ExpenseWithDetails; settlements: Settlement[]; userId: string }) {
  const status = getExpenseStatus(expense, settlements, userId);
  return (
    <Link href={`/activity/${expense.id}`} className={styles.expenseRow}>
      <div className={styles.expenseLeft}>
        <p className={styles.expenseDesc}>{expense.description}</p>
        <div className={styles.badgeRow}>
          <span className={styles.groupBadge}>{expense.group.name}</span>
          <span className={styles.categoryBadge}>Sin categoría</span>
          {status === "te-deben" && <span className={styles.statusTeDeben}>TE DEBEN</span>}
          {status === "debes"    && <span className={styles.statusDebes}>DEBO</span>}
          {status === "al-dia"   && <span className={styles.statusAlDia}>AL DÍA</span>}
        </div>
      </div>
      <div className={styles.expenseRight}>
        <div className={styles.expenseAmountRow}>
          <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
          <svg className={styles.expenseChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}
