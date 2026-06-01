"use client";

import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GroupWithMembers, ExpenseWithDetails } from "@/types";
import type { Profile, Settlement } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { computeGlobalBalance } from "@/lib/utils/balance";
import { createSettlement, inviteMemberToGroup, deleteGroup as deleteGroupAction } from "../actions";
import styles from "./group-detail.module.css";

interface Props {
  group: GroupWithMembers;
  expenses: ExpenseWithDetails[];
  settlements: Settlement[];
  userId: string;
  profile: Profile | null;
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
}: Props) {
  const router = useRouter();
  const multiMember = group.members.length > 1;

  // ── Month picker ───────────────────────────────────────────────────────────
  const currentMonthKey = toMonthKey(new Date());
  const storageKey = `spendlab_group_month_${group.id}`;

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    expenses.forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    settlements.forEach((s) => keys.add(s.settled_at.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, settlements, currentMonthKey]);

  // Persist selected month in sessionStorage so navigating to expense detail
  // and back restores the same month. Only resets to current on fresh entry.
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (typeof window === "undefined") return currentMonthKey;
    const saved = sessionStorage.getItem(storageKey);
    return saved && availableMonths.includes(saved) ? saved : currentMonthKey;
  });

  function handleMonthChange(month: string) {
    setSelectedMonth(month);
    if (typeof window !== "undefined") sessionStorage.setItem(storageKey, month);
  }

  const showPicker = availableMonths.length > 1;

  // ── Month-filtered data ────────────────────────────────────────────────────
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === selectedMonth),
    [expenses, selectedMonth]
  );

  const memberIds = group.members.map((m) => m.id);
  const profileMap = new Map(group.members.map((m) => [m.id, m]));

  // Monthly net — based on expenses only (no settlements).
  // Settlements reduce the all-time debt but must not distort the monthly view:
  // a payment made in June for a May debt would otherwise show as a June "debt".
  const { net } = useMemo(() => {
    const splits = filteredExpenses.flatMap((e) => e.splits);
    return computeGlobalBalance(filteredExpenses, splits, [], userId, memberIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredExpenses, userId]);

  // All-time debts — always shown regardless of selected month
  // This is the real outstanding balance: who owes who overall
  const debts = useMemo(() => {
    const allSplits = expenses.flatMap((e) => e.splits);
    const raw = computeGlobalBalance(expenses, allSplits, settlements, userId, memberIds);
    return raw.debts.map((d) => ({
      ...d,
      fromProfile: profileMap.get(d.fromUserId),
      toProfile: profileMap.get(d.toUserId),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, settlements, userId]);

  // ── Invite modal ────────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
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

  function openInvite() {
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
      const result = await inviteMemberToGroup(group.id, inviteEmail);
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

  // ── Delete group ───────────────────────────────────────────────────────────
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [isPendingDeleteGroup, startDeleteGroupTransition] = useTransition();

  function handleDeleteGroup() {
    startDeleteGroupTransition(async () => {
      await deleteGroupAction(group.id);
      router.refresh();
      router.replace("/groups");
    });
  }

  // ── Balance display values ─────────────────────────────────────────────────
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const iOwe    = debts.filter((d) => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
  const theyOwe = debts.filter((d) => d.toUserId   === userId).reduce((s, d) => s + d.amount, 0);

  const owedToNames = debts
    .filter((d) => d.fromUserId === userId)
    .map((d) => firstWord(d.toProfile?.display_name ?? ""))
    .join(", ");
  const owedByNames = debts
    .filter((d) => d.toUserId === userId)
    .map((d) => firstWord(d.fromProfile?.display_name ?? ""))
    .join(", ");

  const [debtsExpanded, setDebtsExpanded] = useState(false);

  const groupSubtitle = !multiMember
    ? "Solo tú"
    : group.members.length === 2
    ? `Tú y ${firstWord(group.members.find((m) => m.id !== userId)?.display_name ?? "")}`
    : `${group.members.length} integrantes`;

    return (
        <div className={styles.page}>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className={styles.header}>
                <button className={styles.iconBtn} onClick={() => router.back()} aria-label="Volver">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M12.5 16L7 10L12.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <div className={styles.headerCenter}>
                    <h1 className={styles.groupName}>{group.name}</h1>
                    <p className={styles.groupSubtitle}>{groupSubtitle}</p>
                </div>
                <button className={styles.inviteBtn} onClick={openInvite}>
                    Invitar
                </button>
            </header>

            <div className={styles.content}>
                {/* ── Month picker ──────────────────────────────────────────── */}
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
                    onClick={() => (iOwe > 0 || theyOwe > 0) && setDebtsExpanded((p) => !p)}
                    aria-expanded={debtsExpanded}
                  >
                    <div className={styles.balanceHeader}>
                      <p className={styles.balanceEyebrow}>Balance</p>
                      {(iOwe > 0 || theyOwe > 0) && (
                        <svg className={`${styles.balanceChevron} ${debtsExpanded ? styles.balanceChevronUp : ""}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <p className={styles.balanceAmount}>
                      {net === 0
                        ? formatCLP(totalExpenses)
                        : net < 0
                        ? formatCLP(net)
                        : `+${formatCLP(net)}`}
                    </p>
                    <p className={styles.balanceSub}>
                      {net === 0
                        ? totalExpenses > 0 ? "Todo al día ✓" : "Sin gastos aún"
                        : net < 0
                        ? `Le debes a ${owedToNames}`
                        : `Te debe ${owedByNames}`}
                    </p>

                    {/* DEBES / TE DEBEN row */}
                    {(iOwe > 0 || theyOwe > 0) && (
                      <div className={styles.balanceDebtRow}>
                        {iOwe > 0 && (
                          <div className={styles.balanceDebtStat}>
                            <span className={styles.balanceDebtLabel}>DEBES</span>
                            <span className={styles.balanceDebtValue}>{formatCLP(iOwe)}</span>
                          </div>
                        )}
                        {theyOwe > 0 && (
                          <div className={styles.balanceDebtStat}>
                            <span className={styles.balanceDebtLabel}>TE DEBEN</span>
                            <span className={styles.balanceDebtValue}>{formatCLP(theyOwe)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expanded debt breakdown */}
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

                {/* ── Danger zone — only for group creator ──────────────────────── */}
                {group.created_by === userId && (
                    <div className={styles.dangerSection}>
                        <button
                            className={styles.btnDeleteGroup}
                            onClick={() => setDeleteGroupOpen(true)}
                        >
                            Eliminar grupo
                        </button>
                    </div>
                )}
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
                            Se eliminarán todos los gastos y datos de &ldquo;{group.name}&rdquo;.
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
        </div>
    );
}


// ── Utils ─────────────────────────────────────────────────────────────────────

/** Format a raw digit string as CLP for display inside an input */
function formatCLPInput(raw: string): string {
  const n = parseInt(raw.replace(/\D/g, "") || "0", 10);
  if (n === 0) return "";
  return new Intl.NumberFormat("es-CL").format(n);
}
