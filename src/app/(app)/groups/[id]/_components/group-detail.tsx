"use client";

import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { GroupWithMembers, ExpenseWithDetails, PendingInvitation, AcceptedInvitation } from "@/types";
import type { Profile } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { computeGlobalBalance } from "@/lib/utils/balance";
import BalanceCard from "@/components/balance-card/balance-card";
import SettlementModal from "@/components/settlement-modal/settlement-modal";
import { createSettlement, inviteMemberToGroup, deleteGroup as deleteGroupAction, acceptInvitation, rejectInvitation, createGroup as createGroupAction, renameGroup as renameGroupAction } from "../actions";
import styles from "./group-detail.module.css";

const LS_LAST_SEEN_KEY = "spendlab_notifs_last_seen";

// useSyncExternalStore helpers — defined outside component for stable references
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
  group: GroupWithMembers;
  expenses: ExpenseWithDetails[];
  userId: string;
  profile: Profile | null;
  allGroups: GroupWithMembers[];
  invitations: PendingInvitation[];
  acceptedInvitations?: AcceptedInvitation[];
}

// YYYY-MM string for a given Date
function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date  = new Date(y, m - 1, 1);
  const month = date.toLocaleDateString("es-CL", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExpenseStatus = "te-deben" | "debes" | "al-dia" | "pendiente" | null;

function getExpenseStatus(
  expense: ExpenseWithDetails,
  userId: string
): ExpenseStatus {
  if (expense.paid_by === null) {
    return expense.splits.some((s) => s.user_id === userId) ? "pendiente" : null;
  }

  const payerId = expense.paid_by;
  const hasOtherParticipants = expense.splits.some((s) => s.user_id !== payerId);
  if (!hasOtherParticipants) return null;

  if (payerId === userId) {
    const others = expense.splits.filter((s) => s.user_id !== userId);
    const allSettled = others.every((s) => s.paid_amount >= s.amount);
    return allSettled ? "al-dia" : "te-deben";
  }

  const userSplit = expense.splits.find((s) => s.user_id === userId);
  if (!userSplit) return null;
  return userSplit.paid_amount >= userSplit.amount ? "al-dia" : "debes";
}

function groupByDate(
  expenses: ExpenseWithDetails[]
): { label: string; expenses: ExpenseWithDetails[] }[] {
  const ordered: string[] = [];
  const map = new Map<string, ExpenseWithDetails[]>();
  for (const expense of expenses) {
    const [y, m, d] = expense.expense_date.slice(0, 10).split("-");
    const label = `${d}/${m}/${y}`;
    if (!map.has(label)) { ordered.push(label); map.set(label, []); }
    map.get(label)!.push(expense);
  }
  return ordered.map((label) => ({ label, expenses: map.get(label)! }));
}


function firstWord(name: string): string {
  return name?.split(" ")[0] ?? name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GroupDetail({
  group,
  expenses,
  userId,
  allGroups,
  invitations,
  acceptedInvitations = [],
}: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const multiMember  = group.members.length > 1;

  useEffect(() => {
    localStorage.setItem("lastGroupId", group.id);
  }, [group.id]);

  // ── Month picker ───────────────────────────────────────────────────────────
  const currentMonthKey = toMonthKey(new Date());

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    expenses.forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, currentMonthKey]);

  // Month lives in the URL (?m=2026-05) so:
  //   - router.back() from expense detail preserves the param
  //   - navigating to the group from anywhere else (no ?m) resets to current month
  const urlMonth    = searchParams.get("m");
  const initialMonth = urlMonth && availableMonths.includes(urlMonth)
    ? urlMonth
    : currentMonthKey;
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);

  function handleMonthChange(month: string) {
    setSelectedMonth(month);
    const params = new URLSearchParams(searchParams.toString());
    params.set("m", month);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const showPicker = availableMonths.length > 1;

  // ── Month-filtered data ────────────────────────────────────────────────────
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === selectedMonth),
    [expenses, selectedMonth]
  );

  const memberIds = group.members.map((m) => m.id);
  const profileMap = new Map(group.members.map((m) => [m.id, m]));

  // All-time outstanding balance using paid_amount — no settlements needed.
  const { debts } = useMemo(() => {
    const raw = computeGlobalBalance(expenses, userId, memberIds);
    return {
      debts: raw.debts.map((d) => ({
        ...d,
        fromProfile: profileMap.get(d.fromUserId),
        toProfile: profileMap.get(d.toUserId),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, userId]);

  // ── Invite modal ────────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTargetGroupId, setInviteTargetGroupId] = useState(group.id);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isPendingInvite, startInviteTransition] = useTransition();
  const inviteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inviteOpen) {
      const t = setTimeout(() => inviteInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [inviteOpen]);

  function openInvite(targetGroupId = group.id) {
    setInviteTargetGroupId(targetGroupId);
    setInviteEmail("");
    setInviteError("");
    setInviteSuccess(false);
    setInviteOpen(true);
  }

  const closeInvite = useCallback(() => {
    if (isPendingInvite) return;
    setInviteOpen(false);
  }, [isPendingInvite]);

  function handleInvite() {
    startInviteTransition(async () => {
      const result = await inviteMemberToGroup(inviteTargetGroupId, inviteEmail);
      if (result.error) {
        setInviteError(result.error);
      } else {
        setInviteSuccess(true);
        setTimeout(() => setInviteOpen(false), 1500);
      }
    });
  }

  // ── Settlement modal ────────────────────────────────────────────────────────
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleGroupToUserId, setSettleGroupToUserId] = useState<string>("");
  const [settlementRaw, setSettlementRaw] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [isPendingSettle, startSettleTransition] = useTransition();

  const settlementAmount = parseInt(settlementRaw.replace(/\D/g, "") || "0", 10);

  function openSettle() {
    const topDebt = debts.find((d) => d.fromUserId === userId);
    setSettleGroupToUserId(topDebt?.toUserId ?? "");
    setSettlementRaw(String(iOwe));
    setSettlementError("");
    setSettleOpen(true);
  }

  function closeSettlement() {
    if (isPendingSettle) return;
    setSettleOpen(false);
    setSettlementRaw("");
    setSettlementError("");
  }

  function handleSettlementAmountChange(digits: string) {
    setSettlementRaw(digits);
    if (settlementError) setSettlementError("");
  }

  function handleSettle() {
    if (settlementAmount <= 0) {
      setSettlementError("Ingresa un monto válido");
      return;
    }
    if (!settleGroupToUserId) return;
    startSettleTransition(async () => {
      const result = await createSettlement(
        group.id,
        userId,
        settleGroupToUserId,
        settlementAmount
      );
      if (result.error) {
        setSettlementError(result.error);
      } else {
        setSettleOpen(false);
        router.refresh();
      }
    });
  }

  // ── Escape to close invite modal too ───────────────────────────────────────
  useEffect(() => {
    if (!inviteOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeInvite();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inviteOpen, closeInvite]);

  // ── Group selector modal ────────────────────────────────────────────────────
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false);

  // ── Notification modal ──────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);

  // ── Push permission banner ──────────────────────────────────────────────────
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

  // ── Expense notifications ───────────────────────────────────────────────────
  // useSyncExternalStore: null on server, real localStorage value on client.
  // No useEffect+setState needed, so react-hooks/set-state-in-effect doesn't trigger.
  const storedTs = useSyncExternalStore(subscribeLastSeen, getLastSeenClient, getLastSeenServer);
  const [lastSeenOverride, setLastSeenOverride] = useState<string | null>(null);
  const lastSeenTs = lastSeenOverride ?? storedTs;
  const notifHydrated = lastSeenTs !== null;

  // Notify when user owes money on an expense they didn't create.
  // Exception: pending expenses (no payer) always notify even if user created them.
  const expenseNotifs = useMemo(() => {
    const lastSeen = lastSeenTs ? new Date(lastSeenTs) : new Date(0);
    return expenses.filter((e) => {
      if (new Date(e.created_at) <= lastSeen) return false;
      if (e.paid_by === null) {
        if (e.created_by === userId) return false;
        const s = e.splits.find((sp) => sp.user_id === userId);
        return !!s && s.paid_amount < s.amount;
      }
      // Shared: skip if user is payer or creator
      if (e.paid_by === userId || e.created_by === userId) return false;
      const s = e.splits.find((sp) => sp.user_id === userId);
      return !!s && s.paid_amount < s.amount;
    }).slice(0, 20);
  }, [expenses, userId, lastSeenTs]);

  const acceptedNotifs = acceptedInvitations.filter(
    (inv) => lastSeenTs ? inv.accepted_at > lastSeenTs : true
  );
  const totalBadge = invitations.length + expenseNotifs.length + acceptedNotifs.length;

  function closeNotifs() {
    setNotifOpen(false);
    try {
      const now = new Date().toISOString();
      localStorage.setItem(LS_LAST_SEEN_KEY, now);
      setLastSeenOverride(now);
    } catch { /* ignore */ }
  }

  // ── Create group (from selector modal) ─────────────────────────────────────
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [createGroupError, setCreateGroupError] = useState("");
  const [isPendingCreateGroup, startCreateGroupTransition] = useTransition();
  const createGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (createGroupOpen) {
      const t = setTimeout(() => createGroupInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [createGroupOpen]);

  function handleCreateGroup() {
    const trimmed = createGroupName.trim();
    if (!trimmed) { setCreateGroupError("El nombre no puede estar vacío"); return; }
    startCreateGroupTransition(async () => {
      const result = await createGroupAction(trimmed, userId);
      if (result.error) {
        setCreateGroupError(result.error);
      } else {
        setCreateGroupOpen(false);
        setGroupSelectorOpen(false);
        if (result.group) router.push(`/groups/${result.group.id}`);
        else router.refresh();
      }
    });
  }

  // ── Delete group ───────────────────────────────────────────────────────────
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [deleteTargetGroupId, setDeleteTargetGroupId] = useState(group.id);
  const [deleteTargetGroupName, setDeleteTargetGroupName] = useState(group.name);
  const [isPendingDeleteGroup, startDeleteGroupTransition] = useTransition();

  function openDeleteGroup(targetId = group.id, targetName = group.name) {
    setDeleteTargetGroupId(targetId);
    setDeleteTargetGroupName(targetName);
    setDeleteGroupOpen(true);
  }

  function handleDeleteGroup() {
    startDeleteGroupTransition(async () => {
      await deleteGroupAction(deleteTargetGroupId);
      if (deleteTargetGroupId === group.id) {
        router.replace("/groups");
      } else {
        setDeleteGroupOpen(false);
        router.refresh();
      }
    });
  }

  // ── Rename group ───────────────────────────────────────────────────────────
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetGroupId, setRenameTargetGroupId] = useState(group.id);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isPendingRename, startRenameTransition] = useTransition();
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameOpen) {
      const t = setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 60);
      return () => clearTimeout(t);
    }
  }, [renameOpen]);

  function openRename(targetId: string, currentName: string) {
    setRenameTargetGroupId(targetId);
    setRenameValue(currentName);
    setRenameError("");
    setRenameOpen(true);
  }

  function handleRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameError("El nombre no puede estar vacío"); return; }
    startRenameTransition(async () => {
      const result = await renameGroupAction(renameTargetGroupId, trimmed);
      if (result.error) {
        setRenameError(result.error);
      } else {
        setRenameOpen(false);
        router.refresh();
      }
    });
  }

  // ── Balance display values ─────────────────────────────────────────────────
  const monthTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  // Split amounts the user owes for pending expenses (paid_by = null).
  // These have no creditor so simplifyDebts won't pick them up.
  const pendingOwe = useMemo(() =>
    expenses
      .filter((e) => e.paid_by === null)
      .flatMap((e) => e.splits)
      .filter((s) => s.user_id === userId)
      .reduce((sum, s) => sum + Math.max(0, s.amount - (s.paid_amount ?? 0)), 0),
    [expenses, userId]
  );

  const debtToPersons = debts.filter((d) => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
  const iOwe    = debtToPersons + pendingOwe;
  const theyOwe = debts.filter((d) => d.toUserId   === userId).reduce((s, d) => s + d.amount, 0);

  const [debtsExpanded, setDebtsExpanded] = useState(false);

  const groupSubtitle = (() => {
    if (!multiMember) return "Solo tú";
    const names = group.members.map((m) => firstWord(m.display_name ?? ""));
    const joined = names.join(", ");
    return joined.length <= 28 ? joined : `${group.members.length} integrantes`;
  })();

    return (
        <div className={styles.page}>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className={styles.header}>
                {/* Group selector pill */}
                <button className={styles.groupSelector} onClick={() => setGroupSelectorOpen(true)} aria-label="Cambiar grupo">
                    <div className={styles.groupAvatar}>
                        {group.name[0]?.toUpperCase() ?? "G"}
                    </div>
                    <div className={styles.groupSelectorInfo}>
                        <span className={styles.groupSelectorName}>{group.name}</span>
                        <span className={styles.groupSelectorSub}>{groupSubtitle}</span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.groupSelectorChevron} aria-hidden="true">
                        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>

                <button className={styles.iconBtnBell} onClick={() => setNotifOpen(true)} aria-label={`Notificaciones${notifHydrated && totalBadge > 0 ? ` · ${totalBadge}` : ""}`}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 2a5.5 5.5 0 0 1 5.5 5.5c0 3 .9 4.5 1.5 5H2c.6-.5 1.5-2 1.5-5A5.5 5.5 0 0 1 9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M7 15a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    {notifHydrated && totalBadge > 0 && (
                        <span className={styles.bellBadge}>{totalBadge}</span>
                    )}
                </button>
            </header>

            <div className={styles.content}>
                {/* ── Push notification permission banner ───────────────────── */}
                {showPushPrompt && (
                  <div className={styles.pushBanner}>
                    <p className={styles.pushBannerText}>
                      Activa notificaciones para saber cuando se añadan gastos al grupo
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

                {/* ── Month picker (single-member only, outside card) ───────── */}
                {!multiMember && showPicker && (
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
                        onChange={(e) => handleMonthChange(e.target.value)}
                        aria-label="Seleccionar mes"
                      >
                        {availableMonths.map((key) => (
                          <option key={key} value={key}>{monthLabel(key)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* ── Balance card (multi only) ─────────────────────────────── */}
                {multiMember && (
                  <BalanceCard
                    selectedMonth={selectedMonth}
                    availableMonths={availableMonths}
                    showPicker={showPicker}
                    onMonthChange={handleMonthChange}
                    monthLabel={monthLabel}
                    expenseCount={filteredExpenses.length}
                    totalAmount={monthTotal}
                    debes={iOwe}
                    teDeben={theyOwe}
                    debts={debts.map((debt) => ({
                      fromName: firstWord(debt.fromProfile?.display_name ?? debt.fromUserId),
                      toName: firstWord(debt.toProfile?.display_name ?? debt.toUserId),
                      amount: debt.amount,
                    }))}
                    expanded={debtsExpanded}
                    onToggleExpand={() => setDebtsExpanded((p) => !p)}
                    onRegisterPago={iOwe > 0 ? openSettle : undefined}
                  />
                )}

                {/* ── Expenses section ─────────────────────────────────────────── */}
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>Lista de gastos</span>
                        <Link href={`/groups/${group.id}/expenses/new`} className={styles.addBtn}>
                            + Añadir
                        </Link>
                    </div>

                    {filteredExpenses.length === 0 ? (
                        <div className={styles.emptyExpenses}>
                            <p className={styles.emptyTitle}>Sin gastos este mes</p>
                            <p className={styles.emptySub}>
                              {selectedMonth === currentMonthKey
                                ? "Añade el primer gasto del mes."
                                : "No hubo gastos en este período."}
                            </p>
                        </div>
                    ) : (
                        <div>
                            {groupByDate(filteredExpenses).map(({ label, expenses: dateExpenses }) => (
                                <div key={label} className={styles.dateGroup}>
                                    <p className={styles.dateGroupLabel}>{label}</p>
                                    <div className={styles.expenseList}>
                                        {dateExpenses.map((expense) => {
                                          const s = getExpenseStatus(expense, userId);
                                          const userSplit = expense.splits.find((sp) => sp.user_id === userId);
                                          const remaining = (s === "debes" || s === "pendiente") && userSplit
                                            ? Math.max(0, userSplit.amount - (userSplit.paid_amount ?? 0))
                                            : 0;
                                          const owedToUser = s === "te-deben"
                                            ? expense.splits
                                                .filter((sp) => sp.user_id !== userId)
                                                .reduce((sum, sp) => sum + Math.max(0, sp.amount - sp.paid_amount), 0)
                                            : 0;

                                          let statusBadge: React.ReactNode = null;
                                          if (s === "te-deben")       statusBadge = <span className={styles.statusTeDeben}>TE DEBEN</span>;
                                          else if (s === "debes")     statusBadge = remaining > 0 ? <span className={styles.statusDebes}>DEBE</span> : <span className={styles.statusAlDia}>AL DÍA</span>;
                                          else if (s === "al-dia")    statusBadge = <span className={styles.statusAlDia}>AL DÍA</span>;
                                          else if (s === "pendiente") statusBadge = remaining > 0 ? <span className={styles.statusDebes}>DEBE</span> : <span className={styles.statusAlDia}>AL DÍA</span>;

                                          return (
                                            <Link key={expense.id} href={`/activity/${expense.id}`} className={styles.expenseRow}>
                                                <div className={styles.expenseLeft}>
                                                    <p className={styles.expenseDesc}>{expense.description}</p>
                                                    <div className={styles.badgeRow}>{statusBadge}</div>
                                                </div>
                                                <div className={styles.expenseRight}>
                                                    <div className={styles.expenseAmountCol}>
                                                        <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
                                                        {remaining > 0 && <span className={styles.debesMonto}>-{formatCLP(remaining)}</span>}
                                                        {owedToUser > 0 && <span className={styles.chipPositive}>+{formatCLP(owedToUser)}</span>}
                                                    </div>
                                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.expenseChevron}>
                                                        <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            </Link>
                                          );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* ── Delete group modal ───────────────────────────────────────────── */}
            {deleteGroupOpen && (
                <div
                    className={styles.backdrop}
                    onClick={() => { if (!isPendingDeleteGroup) setDeleteGroupOpen(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Eliminar grupo"
                >
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <p className={styles.modalTitle}>¿Eliminar grupo?</p>
                        <p className={styles.modalSub}>
                            Se eliminarán todos los gastos y datos de &ldquo;{deleteTargetGroupName}&rdquo;.
                            Esta acción no se puede deshacer.
                        </p>
                        <div className={styles.modalActions}>
                            <button
                                className={styles.btnCancel}
                                onClick={() => setDeleteGroupOpen(false)}
                                disabled={isPendingDeleteGroup}
                            >
                                Cancelar
                            </button>
                            <button
                                className={styles.btnDanger}
                                onClick={handleDeleteGroup}
                                disabled={isPendingDeleteGroup}
                            >
                                {isPendingDeleteGroup ? "Eliminando…" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Settlement modal ─────────────────────────────────────────────── */}
            <SettlementModal
                open={settleOpen}
                onClose={closeSettlement}
                subtitle={
                    debtToPersons > 0
                        ? `Deuda total: ${formatCLP(iOwe)} · primero salda integrantes, luego pendientes`
                        : `Gastos pendientes: ${formatCLP(pendingOwe)}`
                }
                amountRaw={settlementRaw}
                onAmountChange={handleSettlementAmountChange}
                maxAmount={iOwe}
                error={settlementError}
                pending={isPendingSettle}
                onConfirm={handleSettle}
            />

            {/* ── Invite modal ────────────────────────────────────────────────── */}
            {inviteOpen && (
                <div
                    className={styles.backdrop}
                    onClick={closeInvite}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Invitar integrante"
                >
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        {inviteSuccess ? (
                            <div className={styles.inviteSuccess}>
                                <p className={styles.successIcon}>✓</p>
                                <p className={styles.modalTitle}>Invitación enviada</p>
                            </div>
                        ) : (
                            <>
                                <p className={styles.modalTitle}>Invitar integrante</p>
                                <input
                                    ref={inviteInputRef}
                                    className={styles.modalInput}
                                    type="email"
                                    placeholder="correo@ejemplo.com"
                                    value={inviteEmail}
                                    maxLength={254}
                                    disabled={isPendingInvite}
                                    onChange={(e) => {
                                        setInviteEmail(e.target.value);
                                        if (inviteError) setInviteError("");
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleInvite();
                                    }}
                                />
                                {inviteError && (
                                    <p className={styles.modalError}>{inviteError}</p>
                                )}
                                <div className={styles.modalActions}>
                                    <button
                                        className={styles.btnCancel}
                                        onClick={closeInvite}
                                        disabled={isPendingInvite}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className={styles.btnConfirm}
                                        onClick={handleInvite}
                                        disabled={isPendingInvite || !inviteEmail.trim()}
                                    >
                                        {isPendingInvite ? "Enviando…" : "Invitar"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Group selector modal ─────────────────────────────────────────── */}
            {groupSelectorOpen && (
                <div
                    className={styles.backdrop}
                    onClick={() => setGroupSelectorOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Cambiar grupo"
                >
                    <div className={styles.selectorSheet} onClick={(e) => e.stopPropagation()}>
                        <p className={styles.selectorTitle}>Tus grupos</p>
                        <div className={styles.selectorList}>
                            {allGroups.map((g) => (
                                <div key={g.id} className={`${styles.selectorRow} ${g.id === group.id ? styles.selectorRowActive : ""}`}>
                                    {/* Left: navigate */}
                                    <Link
                                        href={`/groups/${g.id}`}
                                        className={styles.selectorRowLink}
                                        onClick={() => setGroupSelectorOpen(false)}
                                    >
                                        <div className={styles.selectorAvatar}>{g.name[0]?.toUpperCase() ?? "G"}</div>
                                        <div className={styles.selectorInfo}>
                                            <p className={styles.selectorName}>{g.name}</p>
                                            <p className={styles.selectorMeta}>
                                                {g.members.length === 1 ? "Solo tú" : `${g.members.length} integrantes`}
                                                {g.members.length > 1 && <GroupBalanceChip balance={g.balance} />}
                                            </p>
                                        </div>
                                    </Link>
                                    {/* Right: actions */}
                                    <div className={styles.selectorRowActions}>
                                        <button
                                            className={styles.selectorActionBtn}
                                            onClick={(e) => { e.stopPropagation(); setGroupSelectorOpen(false); openInvite(g.id); }}
                                            aria-label={`Invitar a ${g.name}`}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <circle cx="7" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                                                <path d="M1.5 14c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                                <path d="M12.5 2v5M10 4.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                            </svg>
                                        </button>
                                        {g.created_by === userId && (
                                            <button
                                                className={styles.selectorActionBtn}
                                                onClick={(e) => { e.stopPropagation(); setGroupSelectorOpen(false); openRename(g.id, g.name); }}
                                                aria-label={`Renombrar ${g.name}`}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                    <path d="M10.5 2.5a1.5 1.5 0 0 1 2.121 0l.879.879a1.5 1.5 0 0 1 0 2.121L5.5 13.5H2.5v-3L10.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                                    <path d="M8.5 4.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                                </svg>
                                            </button>
                                        )}
                                        {g.created_by === userId && (
                                            <button
                                                className={styles.selectorActionBtnDanger}
                                                onClick={(e) => { e.stopPropagation(); setGroupSelectorOpen(false); openDeleteGroup(g.id, g.name); }}
                                                aria-label={`Eliminar ${g.name}`}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                    <path d="M2.5 4.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                                    <path d="M6 4.5V3h4v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M4 4.5l.75 9h6.5l.75-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            className={styles.selectorNewBtn}
                            onClick={() => { setGroupSelectorOpen(false); setCreateGroupName(""); setCreateGroupError(""); setCreateGroupOpen(true); }}
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            Nuevo grupo
                        </button>
                    </div>
                </div>
            )}

            {/* ── Create group modal (launched from selector) ──────────────────── */}
            {createGroupOpen && (
                <div
                    className={styles.backdrop}
                    onClick={() => { if (!isPendingCreateGroup) setCreateGroupOpen(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Nuevo grupo"
                >
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <p className={styles.modalTitle}>Nuevo grupo</p>
                        <input
                            ref={createGroupInputRef}
                            className={styles.modalInput}
                            type="text"
                            placeholder="Nombre del grupo"
                            value={createGroupName}
                            maxLength={60}
                            disabled={isPendingCreateGroup}
                            onChange={(e) => { setCreateGroupName(e.target.value); if (createGroupError) setCreateGroupError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); }}
                        />
                        {createGroupError && <p className={styles.modalError}>{createGroupError}</p>}
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setCreateGroupOpen(false)} disabled={isPendingCreateGroup}>Cancelar</button>
                            <button className={styles.btnConfirm} onClick={handleCreateGroup} disabled={isPendingCreateGroup || !createGroupName.trim()}>
                                {isPendingCreateGroup ? "Creando…" : "Crear"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Rename group modal ───────────────────────────────────────────── */}
            {renameOpen && (
                <div
                    className={styles.backdrop}
                    onClick={() => { if (!isPendingRename) setRenameOpen(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Renombrar grupo"
                >
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <p className={styles.modalTitle}>Renombrar grupo</p>
                        <input
                            ref={renameInputRef}
                            className={styles.modalInput}
                            type="text"
                            placeholder="Nombre del grupo"
                            value={renameValue}
                            maxLength={60}
                            disabled={isPendingRename}
                            onChange={(e) => { setRenameValue(e.target.value); if (renameError) setRenameError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                        />
                        {renameError && <p className={styles.modalError}>{renameError}</p>}
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setRenameOpen(false)} disabled={isPendingRename}>Cancelar</button>
                            <button className={styles.btnConfirm} onClick={handleRename} disabled={isPendingRename || !renameValue.trim()}>
                                {isPendingRename ? "Guardando…" : "Guardar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Notification modal ───────────────────────────────────────────── */}
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

                        {expenseNotifs.length === 0 && invitations.length === 0 && acceptedNotifs.length === 0 && (
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
                                            {e.payer?.display_name ?? "Alguien"} añadió
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

                        {acceptedNotifs.length > 0 && (
                            <>
                                {(expenseNotifs.length > 0) && <div className={styles.notifSectionGap} />}
                                <p className={styles.notifSubLabel}>INVITACIONES ACEPTADAS · {acceptedNotifs.length}</p>
                                {acceptedNotifs.map((inv) => (
                                    <div key={inv.id} className={styles.expenseNotifCard}>
                                        <p className={styles.expenseNotifDesc}>{inv.invitee_name}</p>
                                        <p className={styles.expenseNotifMeta}>
                                            Se unió a {inv.group_name}
                                        </p>
                                    </div>
                                ))}
                            </>
                        )}

                        {(expenseNotifs.length > 0 || acceptedNotifs.length > 0) && invitations.length > 0 && (
                            <div className={styles.notifSectionGap} />
                        )}

                        {invitations.length > 0 && (
                            <>
                                <p className={styles.notifSubLabel}>INVITACIONES · {invitations.length}</p>
                                {invitations.map((inv) => (
                                    <NotifInvCard
                                        key={inv.id}
                                        invitation={inv}
                                        onDone={() => { router.refresh(); closeNotifs(); }}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


// ── Notification invitation card ──────────────────────────────────────────────

function NotifInvCard({
  invitation,
  onDone,
}: {
  invitation: PendingInvitation;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [invError, setInvError] = useState("");

  function handleAccept() {
    setInvError("");
    startTransition(async () => {
      const result = await acceptInvitation(invitation.id);
      if (result.error) setInvError(result.error);
      else onDone();
    });
  }

  function handleReject() {
    setInvError("");
    startTransition(async () => {
      const result = await rejectInvitation(invitation.id, invitation.group_id);
      if (result.error) setInvError(result.error);
      else onDone();
    });
  }

  const memberLabel = invitation.member_count === 1 ? "1 integrante" : `${invitation.member_count} integrantes`;

  return (
    <div className={styles.notifCard}>
      <p className={styles.notifCardName}>{invitation.group_name}</p>
      <p className={styles.notifCardMeta}>Te invitó {invitation.inviter_name} · {memberLabel}</p>
      {invError && <p className={styles.modalError}>{invError}</p>}
      <div className={styles.notifCardActions}>
        <button className={styles.btnCancel} onClick={handleReject} disabled={isPending}>Rechazar</button>
        <button className={styles.btnConfirm} onClick={handleAccept} disabled={isPending}>
          {isPending ? "…" : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Aceptar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function GroupBalanceChip({ balance }: { balance: number }) {
  if (balance === 0) return <span className={styles.chipNeutral}>Sin deudas</span>;
  if (balance > 0)   return <span className={styles.chipPositive}>+{formatCLP(balance)}</span>;
  return <span className={styles.chipNegative}>{formatCLP(balance)}</span>;
}
