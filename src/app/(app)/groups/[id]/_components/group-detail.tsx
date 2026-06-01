"use client";

import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { GroupWithMembers, ExpenseWithDetails, PendingInvitation } from "@/types";
import type { Profile, Settlement } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { computeGlobalBalance } from "@/lib/utils/balance";
import { createSettlement, inviteMemberToGroup, deleteGroup as deleteGroupAction, acceptInvitation, rejectInvitation, createGroup as createGroupAction } from "../actions";
import styles from "./group-detail.module.css";

interface Props {
  group: GroupWithMembers;
  expenses: ExpenseWithDetails[];
  settlements: Settlement[];
  userId: string;
  profile: Profile | null;
  allGroups: GroupWithMembers[];
  invitations: PendingInvitation[];
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

function formatRelativeDate(dateStr: string): string {
  // expense_date is YYYY-MM-DD; add noon to avoid timezone shifts
  const date = new Date(
    dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr
  );
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / 86_400_000
  );
  if (diffDays <= 0) return "Hoy"; // also handles future dates (timezone edge cases)
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function firstWord(name: string): string {
  return name?.split(" ")[0] ?? name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GroupDetail({
  group,
  expenses,
  settlements,
  userId,
  allGroups,
  invitations,
}: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const multiMember  = group.members.length > 1;

  // ── Month picker ───────────────────────────────────────────────────────────
  const currentMonthKey = toMonthKey(new Date());

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    expenses.forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    settlements.forEach((s) => keys.add(s.settled_at.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, settlements, currentMonthKey]);

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

  // All-time outstanding balance — always uses every expense and settlement ever
  // recorded, regardless of which month is selected. The month picker only
  // filters the expense list below.
  const { net, debts } = useMemo(() => {
    const allSplits = expenses.flatMap((e) => e.splits);
    const raw = computeGlobalBalance(expenses, allSplits, settlements, userId, memberIds);
    return {
      net: raw.net,
      debts: raw.debts.map((d) => ({
        ...d,
        fromProfile: profileMap.get(d.fromUserId),
        toProfile: profileMap.get(d.toUserId),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, settlements, userId]);

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
  const [settlementTarget, setSettlementTarget] = useState<{
    toUserId: string;
    toName: string;
    maxAmount: number;
  } | null>(null);
  const [settlementRaw, setSettlementRaw] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [isPendingSettle, startSettleTransition] = useTransition();
  const settlementInputRef = useRef<HTMLInputElement>(null);

  const settlementAmount = parseInt(settlementRaw.replace(/\D/g, "") || "0", 10);

  useEffect(() => {
    if (!settlementTarget) return;
    const t = setTimeout(() => settlementInputRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, [settlementTarget]);

  function openSettlement(toUserId: string, toName: string, maxAmount: number) {
    setSettlementError("");
    setSettlementRaw(String(maxAmount));
    setSettlementTarget({ toUserId, toName, maxAmount });
  }

  const closeSettlement = useCallback(() => {
    if (isPendingSettle) return;
    setSettlementTarget(null);
    setSettlementRaw("");
    setSettlementError("");
  }, [isPendingSettle]);

  useEffect(() => {
    if (!settlementTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettlement();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settlementTarget, closeSettlement]);

  function handleSettle() {
    if (settlementAmount <= 0) {
      setSettlementError("Ingresa un monto válido");
      return;
    }
    if (!settlementTarget) return;
    startSettleTransition(async () => {
      const result = await createSettlement(
        group.id,
        userId,
        settlementTarget.toUserId,
        settlementAmount
      );
      if (result.error) {
        setSettlementError(result.error);
      } else {
        setSettlementTarget(null);
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
      router.refresh();
      // If deleting current group, navigate away; otherwise stay
      if (deleteTargetGroupId === group.id) {
        router.replace("/groups");
      } else {
        setDeleteGroupOpen(false);
        router.refresh();
      }
    });
  }

  // ── Balance display values ─────────────────────────────────────────────────
  const iOwe    = debts.filter((d) => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
  const theyOwe = debts.filter((d) => d.toUserId   === userId).reduce((s, d) => s + d.amount, 0);

  const [debtsExpanded, setDebtsExpanded] = useState(false);

  const groupSubtitle = !multiMember
    ? "Solo tú"
    : group.members.length === 2
    ? `${firstWord(group.members.find((m) => m.id !== userId)?.display_name ?? "")} y tú`
    : `${group.members.length} integrantes`;

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

                <button className={styles.iconBtnBell} onClick={() => setNotifOpen(true)} aria-label="Notificaciones">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 2a5.5 5.5 0 0 1 5.5 5.5c0 3 .9 4.5 1.5 5H2c.6-.5 1.5-2 1.5-5A5.5 5.5 0 0 1 9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M7 15a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    {invitations.length > 0 && (
                        <span className={styles.bellBadge}>{invitations.length}</span>
                    )}
                </button>
            </header>

            <div className={styles.content}>
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
                  <button
                    className={styles.balanceCard}
                    onClick={() => debts.length > 1 && setDebtsExpanded((p) => !p)}
                    aria-expanded={debtsExpanded}
                  >
                    {/* Top row: month pill + chevron (only when multiple debts to expand) */}
                    <div className={styles.balanceTopRow}>
                      {showPicker ? (
                        <div className={styles.monthPill} onClick={(e) => e.stopPropagation()}>
                          <span className={styles.monthPillLabel}>{monthLabel(selectedMonth)}</span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
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
                      ) : (
                        <span className={styles.monthPillStatic}>{monthLabel(selectedMonth)}</span>
                      )}
                      {debts.length > 1 && (
                        <svg
                          className={`${styles.balanceChevron} ${debtsExpanded ? styles.balanceChevronUp : ""}`}
                          width="16" height="16" viewBox="0 0 16 16" fill="none"
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>

                    <p className={styles.balanceAmount}>
                      {net === 0 ? "$0" : net < 0 ? formatCLP(net) : `+${formatCLP(net)}`}
                    </p>

                    {/* Divider + DEBES / TE DEBEN — always visible even at $0 */}
                    <div className={styles.balanceDividerLine} />
                    <div className={styles.balanceDebtRow}>
                      <div className={styles.balanceDebtStat}>
                        <span className={styles.balanceDebtLabel}>DEBES</span>
                        <span className={styles.balanceDebtValue}>{formatCLP(iOwe)}</span>
                      </div>
                      <div className={styles.balanceDebtStat}>
                        <span className={styles.balanceDebtLabel}>TE DEBEN</span>
                        <span className={styles.balanceDebtValue}>{formatCLP(theyOwe)}</span>
                      </div>
                    </div>

                    {/* Expanded breakdown (grupos con >2 miembros) */}
                    {debtsExpanded && debts.length > 0 && (
                      <div className={styles.balanceBreakdown}>
                        <div className={styles.balanceDivider} />
                        {debts.map((debt, i) => {
                          const fromName = firstWord(debt.fromProfile?.display_name ?? debt.fromUserId);
                          const toName   = firstWord(debt.toProfile?.display_name   ?? debt.toUserId);
                          return (
                            <div key={i} className={styles.debtBreakdownRow}>
                              <span className={styles.debtBreakdownNames}>{fromName} → {toName}</span>
                              <span className={styles.debtBreakdownAmount}>{formatCLP(debt.amount)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Registrar pago */}
                    {iOwe > 0 && (
                      <button
                        className={styles.balanceRegisterBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          const debt = debts.find((d) => d.fromUserId === userId);
                          if (debt) openSettlement(debt.toUserId, firstWord(debt.toProfile?.display_name ?? ""), debt.amount);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Registrar pago
                      </button>
                    )}
                  </button>
                )}

                {/* ── Expenses section ─────────────────────────────────────────── */}
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>Gastos recientes</span>
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
                        <div className={styles.expenseList}>
                            {filteredExpenses.map((expense) => {
                                const myShare = expense.splits.find(
                                    (s) => s.user_id === userId
                                )?.amount;
                                const payerName = firstWord(expense.payer?.display_name ?? "");
                                return (
                                    <Link
                                        key={expense.id}
                                        href={`/activity/${expense.id}`}
                                        className={styles.expenseRow}
                                    >
                                        <div className={styles.expenseInfo}>
                                            <div className={styles.expenseRowTop}>
                                                <p className={styles.expenseDesc}>{expense.description}</p>
                                                <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
                                            </div>
                                            <div className={styles.expenseRowBottom}>
                                                <p className={styles.expenseMeta}>
                                                    {formatRelativeDate(expense.expense_date)}{multiMember ? ` · pagó ${payerName}` : ""}
                                                </p>
                                                {multiMember && myShare != null && (
                                                    <p className={styles.expenseShare}>tu parte {formatCLP(myShare)}</p>
                                                )}
                                            </div>
                                        </div>
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.expenseChevron}>
                                            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </Link>
                                );
                            })}
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
            {settlementTarget && (
                <div
                    className={styles.backdrop}
                    onClick={closeSettlement}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Pagar a ${settlementTarget.toName}`}
                >
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <p className={styles.modalTitle}>
                            Pagar a {settlementTarget.toName}
                        </p>
                        <p className={styles.modalSub}>
                            Deuda: {formatCLP(settlementTarget.maxAmount)}
                        </p>
                        <input
                            ref={settlementInputRef}
                            className={styles.modalInput}
                            type="text"
                            inputMode="numeric"
                            placeholder="Monto a pagar"
                            value={settlementRaw ? formatCLPInput(settlementRaw) : ""}
                            disabled={isPendingSettle}
                            onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "");
                                setSettlementRaw(digits);
                                if (settlementError) setSettlementError("");
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSettle();
                            }}
                        />
                        {settlementError && (
                            <p className={styles.modalError}>{settlementError}</p>
                        )}
                        <div className={styles.modalActions}>
                            <button
                                className={styles.btnCancel}
                                onClick={closeSettlement}
                                disabled={isPendingSettle}
                            >
                                Cancelar
                            </button>
                            <button
                                className={styles.btnConfirm}
                                onClick={handleSettle}
                                disabled={isPendingSettle || settlementAmount <= 0}
                            >
                                {isPendingSettle ? "Registrando…" : "Confirmar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* ── Notification modal ───────────────────────────────────────────── */}
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
                                    <NotifInvCard
                                        key={inv.id}
                                        invitation={inv}
                                        onDone={() => { router.refresh(); setNotifOpen(false); }}
                                    />
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

/** Format a raw digit string as CLP for display inside an input */
function formatCLPInput(raw: string): string {
  const n = parseInt(raw.replace(/\D/g, "") || "0", 10);
  if (n === 0) return "";
  return new Intl.NumberFormat("es-CL").format(n);
}
