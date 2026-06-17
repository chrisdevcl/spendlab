"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import type { ExpenseWithDetails, PendingInvitation } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import BalanceCard from "@/components/balance-card/balance-card";
import { HeaderActions } from "@/components/header-actions/header-actions";
import { NewGroupModal } from "@/components/modals/new-group-modal";
import { GroupPickerModal } from "@/components/modals/group-picker-modal";
import { NotificationsModal } from "@/components/modals/notifications-modal";
import styles from "./activity-list.module.css";

const LS_LAST_SEEN_KEY = "spendlab_notifs_last_seen";

function subscribeLastSeen() { return () => {}; }
function getLastSeenServer(): string | null { return null; }
function getLastSeenClient(): string | null {
  try {
    const ts = localStorage.getItem(LS_LAST_SEEN_KEY);
    if (ts) return ts;
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(LS_LAST_SEEN_KEY, d);
    return d;
  } catch { return null; }
}

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

export default function ActivityList({ expenses, userId, invitations }: Props) {
  const [notifOpen, setNotifOpen] = useState(false);

  const storedTs = useSyncExternalStore(subscribeLastSeen, getLastSeenClient, getLastSeenServer);
  const [lastSeenOverride, setLastSeenOverride] = useState<string | null>(null);
  const lastSeenTs = lastSeenOverride ?? storedTs;
  const notifHydrated = lastSeenTs !== null;

  const expenseNotifs = useMemo(() => {
    const lastSeen = lastSeenTs ? new Date(lastSeenTs) : new Date(0);
    return expenses.filter((e) => {
      if (new Date(e.created_at) <= lastSeen) return false;
      if (e.paid_by === null) {
        const s = e.splits.find((sp) => sp.user_id === userId);
        return !!s && s.paid_amount < s.amount;
      }
      if (e.paid_by === userId || e.created_by === userId) return false;
      const s = e.splits.find((sp) => sp.user_id === userId);
      return !!s && s.paid_amount < s.amount;
    }).slice(0, 20);
  }, [expenses, userId, lastSeenTs]);

  const totalBadge = notifHydrated ? invitations.length + expenseNotifs.length : 0;

  function closeNotifs() {
    setNotifOpen(false);
    try {
      const now = new Date().toISOString();
      localStorage.setItem(LS_LAST_SEEN_KEY, now);
      setLastSeenOverride(now);
    } catch { /* ignore */ }
  }

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

  const [expensePickerOpen, setExpensePickerOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const uniqueGroups = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const e of expenses) {
      if (!seen.has(e.group_id)) seen.set(e.group_id, { id: e.group_id, name: e.group.name });
    }
    return [...seen.values()];
  }, [expenses]);

  const currentMonthKey = toMonthKey(new Date());

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    expenses.forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, currentMonthKey]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const showPicker = availableMonths.length > 1;

  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === selectedMonth),
    [expenses, selectedMonth]
  );

  const groups = useMemo(() => groupByDate(filteredExpenses), [filteredExpenses]);

  const totalExpenses = filteredExpenses.length;
  const totalAmount   = filteredExpenses.reduce((s, e) => {
    const userSplit = e.splits.find((sp) => sp.user_id === userId);
    return s + (userSplit?.amount ?? e.amount);
  }, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Actividad</h1>
        <HeaderActions
          hasGroups={uniqueGroups.length > 0}
          notifBadge={totalBadge}
          onNewGroup={() => setNewGroupOpen(true)}
          onNewExpense={() => setExpensePickerOpen(true)}
          onNotif={() => setNotifOpen(true)}
        />
      </header>

      <div className={styles.content}>
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

        <BalanceCard
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          showPicker={showPicker}
          onMonthChange={setSelectedMonth}
          monthLabel={monthLabel}
          expenseCount={totalExpenses}
          totalAmount={totalAmount}
        />

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

      <GroupPickerModal
        open={expensePickerOpen}
        onClose={() => setExpensePickerOpen(false)}
        groups={uniqueGroups}
      />

      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />

      <NotificationsModal
        open={notifOpen}
        onClose={closeNotifs}
        isEmpty={expenseNotifs.length === 0 && invitations.length === 0}
      >
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
                <Link href={`/activity/${e.id}`} className={styles.expenseNotifLink} onClick={closeNotifs}>
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
      </NotificationsModal>
    </div>
  );
}

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
            <span className={styles.compartidoBadge}>Dividido</span>
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
