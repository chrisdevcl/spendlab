"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ExpenseWithDetails, PendingInvitation } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import { computeGlobalBalance } from "@/lib/utils/balance";
import styles from "./activity-list.module.css";

const LS_LAST_SEEN_KEY = "spendlab_notifs_last_seen";

interface Props {
  expenses: ExpenseWithDetails[];
  userId: string;
  invitations: PendingInvitation[];
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

export default function ActivityList({ expenses, userId, invitations }: Props) {
  const [notifOpen, setNotifOpen] = useState(false);

  // ── Expense notifications (localStorage-based read tracking) ────────────
  const [lastSeen, setLastSeen] = useState<Date>(() => {
    if (typeof window === "undefined") return new Date(0);
    try {
      const ts = localStorage.getItem(LS_LAST_SEEN_KEY);
      if (ts) return new Date(ts);
      // First visit: treat last 7 days as potentially unread
      const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      localStorage.setItem(LS_LAST_SEEN_KEY, d.toISOString());
      return d;
    } catch { return new Date(0); }
  });

  // Notify when user owes money on an expense they didn't create.
  // Exception: pending expenses (no payer) always notify even if user created them.
  const expenseNotifs = useMemo(() =>
    expenses.filter((e) => {
      if (new Date(e.created_at) <= lastSeen) return false;
      if (e.paid_by === null) {
        const s = e.splits.find((sp) => sp.user_id === userId);
        return !!s && s.paid_amount < s.amount;
      }
      if (e.paid_by === userId || e.created_by === userId) return false;
      const s = e.splits.find((sp) => sp.user_id === userId);
      return !!s && s.paid_amount < s.amount;
    }).slice(0, 20),
    [expenses, userId, lastSeen]
  );

  const totalBadge = invitations.length + expenseNotifs.length;

  function closeNotifs() {
    setNotifOpen(false);
    // Mark all as seen on close
    try {
      const now = new Date().toISOString();
      localStorage.setItem(LS_LAST_SEEN_KEY, now);
      setLastSeen(new Date(now));
    } catch { /* ignore */ }
  }

  // ── Push permission banner ───────────────────────────────────────────────
  const [pushDismissed, setPushDismissed] = useState(false);
  const [pushPermission, setPushPermission] =
    useState<NotificationPermission | null>(() =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : null
    );

  async function requestPushPermission() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
  }

  const showPushPrompt =
    !pushDismissed &&
    pushPermission === "default" &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

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

  // Monthly totals — use the user's split amount, not the full expense amount
  const totalExpenses = filteredExpenses.length;
  const totalAmount   = filteredExpenses.reduce((s, e) => {
    const userSplit = e.splits.find((sp) => sp.user_id === userId);
    return s + (userSplit?.amount ?? e.amount);
  }, 0);

  // Balance total across all groups — same logic as the group card
  const { iOwe, theyOwe } = useMemo(() => {
    const allUserIds = (() => {
      const ids = new Set<string>([userId]);
      for (const e of expenses) {
        if (e.paid_by) ids.add(e.paid_by);
        for (const s of e.splits) ids.add(s.user_id);
      }
      return [...ids];
    })();

    const { debts } = computeGlobalBalance(expenses, userId, allUserIds);

    const pendingOwe = expenses
      .filter((e) => e.paid_by === null)
      .flatMap((e) => e.splits)
      .filter((s) => s.user_id === userId)
      .reduce((sum, s) => sum + Math.max(0, s.amount - (s.paid_amount ?? 0)), 0);

    const debtToPersons = debts
      .filter((d) => d.fromUserId === userId)
      .reduce((sum, d) => sum + d.amount, 0);

    const theyOweMe = debts
      .filter((d) => d.toUserId === userId)
      .reduce((sum, d) => sum + d.amount, 0);

    return { iOwe: debtToPersons + pendingOwe, theyOwe: theyOweMe };
  }, [expenses, userId]);

  return (
    <div className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h1 className={styles.heading}>Actividad</h1>
        <button
          className={styles.bellBtn}
          onClick={() => setNotifOpen(true)}
          aria-label={`Notificaciones${totalBadge > 0 ? ` · ${totalBadge}` : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1 5 1.5 5.5h-15C3 13 4 11.5 4 8a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {totalBadge > 0 && (
            <span className={styles.bellBadge}>{totalBadge}</span>
          )}
        </button>
      </header>

      <div className={styles.content}>
        {/* ── Push permission banner ────────────────────────────────────── */}
        {showPushPrompt && (
          <div className={styles.pushBanner}>
            <p className={styles.pushBannerText}>
              Activa notificaciones para saber cuando se añadan gastos a tus grupos
            </p>
            <div className={styles.pushBannerActions}>
              <button className={styles.pushBannerDismiss} onClick={() => setPushDismissed(true)}>
                Ahora no
              </button>
              <button className={styles.pushBannerAccept} onClick={requestPushPermission}>
                Activar
              </button>
            </div>
          </div>
        )}

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
          <span className={styles.balanceStatLabel}>TOTAL DEL MES ({totalExpenses})</span>
          <p className={styles.balanceAmount}>{formatCLP(totalAmount)}</p>

          <div className={styles.balanceDivider} />
          <div className={styles.balanceRow}>
            <div className={styles.balanceStat}>
              <span className={styles.balanceStatLabel}>DEBES</span>
              <span className={styles.balanceStatValue}>{formatCLP(Math.max(0, iOwe - theyOwe))}</span>
            </div>
            <div className={styles.balanceStat}>
              <span className={styles.balanceStatLabel}>TE DEBEN</span>
              <span className={styles.balanceStatValue}>{formatCLP(theyOwe)}</span>
            </div>
          </div>

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
                  <ExpenseRow key={expense.id} expense={expense} userId={userId} />
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
          onClick={closeNotifs}
          role="dialog"
          aria-modal="true"
          aria-label="Notificaciones"
        >
          <div className={styles.notifSheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.notifTitle}>Notificaciones</p>

            {expenseNotifs.length === 0 && invitations.length === 0 && (
              <p className={styles.notifEmpty}>Sin notificaciones pendientes.</p>
            )}

            {expenseNotifs.length > 0 && (
              <>
                <p className={styles.notifSubLabel}>GASTOS NUEVOS · {expenseNotifs.length}</p>
                {expenseNotifs.map((e) => (
                  <div key={e.id} className={styles.expenseNotifCard}>
                    <div className={styles.expenseNotifRow}>
                      <p className={styles.expenseNotifDesc}>{e.description}</p>
                      <p className={styles.expenseNotifAmount}>{formatCLP(e.amount)}</p>
                    </div>
                    <p className={styles.expenseNotifMeta}>
                      {e.payer?.display_name ?? "Alguien"} añadió · {e.group.name}
                    </p>
                    <Link
                      href={`/activity/${e.id}`}
                      className={styles.expenseNotifLink}
                      onClick={closeNotifs}
                    >
                      Ver detalle →
                    </Link>
                  </div>
                ))}
              </>
            )}

            {expenseNotifs.length > 0 && invitations.length > 0 && (
              <div className={styles.notifSectionGap} />
            )}

            {invitations.length > 0 && (
              <>
                <p className={styles.notifSubLabel}>INVITACIONES · {invitations.length}</p>
                {invitations.map((inv) => (
                  <div key={inv.id} className={styles.invCard}>
                    <p className={styles.invGroupName}>{inv.group_name}</p>
                    <p className={styles.invMeta}>
                      Te invitó {inv.inviter_name} · {inv.member_count === 1 ? "1 integrante" : `${inv.member_count} integrantes`}
                    </p>
                    <Link href="/groups" className={styles.invLink} onClick={closeNotifs}>
                      Ver en Grupos →
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense, userId }: { expense: ExpenseWithDetails; userId: string }) {
  const userSplit = expense.splits.find((s) => s.user_id === userId);
  const displayAmount = userSplit?.amount ?? expense.amount;
  return (
    <Link href={`/activity/${expense.id}`} className={styles.expenseRow}>
      <div className={styles.expenseLeft}>
        <p className={styles.expenseDesc}>{expense.description}</p>
        <div className={styles.badgeRow}>
          <span className={styles.groupBadge}>{expense.group.name}</span>
          {expense.splits.length > 1 && (
            <span className={styles.compartidoBadge}>Compartido</span>
          )}
        </div>
      </div>
      <div className={styles.expenseRight}>
        <div className={styles.expenseAmountRow}>
          <p className={styles.expenseAmount}>{formatCLP(displayAmount)}</p>
          <svg className={styles.expenseChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}
