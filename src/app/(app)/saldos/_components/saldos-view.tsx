"use client";

import { useState, useMemo, useTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/lib/utils/currency";
import SettlementModal from "@/components/settlement-modal/settlement-modal";
import { HeaderActions } from "@/components/header-actions/header-actions";
import { NewGroupModal } from "@/components/modals/new-group-modal";
import { GroupPickerModal } from "@/components/modals/group-picker-modal";
import { NotificationsModal } from "@/components/modals/notifications-modal";
import { registerPayment, registerPendingPaymentAction } from "../actions";
import type { ExpenseWithDetails, PendingInvitation } from "@/types";
import type { Profile, Settlement } from "@/types/database.types";
import BalanceCard from "@/components/balance-card/balance-card";
import styles from "./saldos-view.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface PersonTx {
  id: string;
  date: string;
  monthKey: string;
  description: string;
  groupName: string;
  amount: number;
  isSettlement?: boolean;
}

interface Props {
  people: Profile[];
  expenses: ExpenseWithDetails[];
  settlements: Settlement[];
  invitations: PendingInvitation[];
  userId: string;
}

// ── Last-seen localStorage helpers ────────────────────────────────────────────

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

// ── Entre todos (virtual entity for sin-pagador expenses) ────────────────────

const CAJA_COMUN_ID = "__caja_comun__";
const CAJA_COMUN_NAME = "Pendiente de pago";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long" });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} ${y}`;
}

/**
 * Returns all movements for userId↔otherId:
 * - Expense rows (net unpaid amount via paid_amount)
 * - Settlement rows (saldos-flow payments, shown as positive/negative movements)
 * totalBalance = sum of all amounts — no separate settlements subtraction needed.
 */
function computeMovements(
  expenses: ExpenseWithDetails[],
  settlements: Settlement[],
  userId: string,
  otherId: string
): PersonTx[] {
  const txs: PersonTx[] = [];

  for (const exp of expenses) {
    if (exp.paid_by === otherId) {
      const mine = exp.splits.find((s) => s.user_id === userId);
      if (mine) {
        const unpaid = mine.amount - (mine.paid_amount ?? 0);
        if (unpaid > 0)
          txs.push({ id: exp.id, date: exp.expense_date, monthKey: exp.expense_date.slice(0, 7), description: exp.description, groupName: exp.group.name, amount: -unpaid });
      }
    } else if (exp.paid_by === userId) {
      const theirs = exp.splits.find((s) => s.user_id === otherId);
      if (theirs) {
        const unpaid = theirs.amount - (theirs.paid_amount ?? 0);
        if (unpaid > 0)
          txs.push({ id: exp.id, date: exp.expense_date, monthKey: exp.expense_date.slice(0, 7), description: exp.description, groupName: exp.group.name, amount: unpaid });
      }
    } else if (exp.paid_by === null && otherId === CAJA_COMUN_ID) {
      const mine = exp.splits.find((s) => s.user_id === userId);
      if (mine) {
        // Always show the full expense (never filtered by paid_amount)
        txs.push({ id: exp.id, date: exp.expense_date, monthKey: exp.expense_date.slice(0, 7), description: exp.description, groupName: exp.group.name, amount: -mine.amount });
        // Show any payment made as a separate positive row
        if ((mine.paid_amount ?? 0) > 0)
          txs.push({ id: `${exp.id}_pago`, date: exp.expense_date, monthKey: exp.expense_date.slice(0, 7), description: `Pago — ${exp.description}`, groupName: exp.group.name, amount: mine.paid_amount, isSettlement: true });
      }
    }
  }

  // Settlement movements (person-to-person only, not CAJA_COMUN_ID)
  if (otherId !== CAJA_COMUN_ID) {
    for (const s of settlements) {
      const d = s.settled_at.slice(0, 10);
      if (s.paid_by === userId && s.paid_to === otherId) {
        txs.push({ id: s.id, date: d, monthKey: d.slice(0, 7), description: s.note || "Pago registrado", groupName: "", amount: +s.amount, isSettlement: true });
      } else if (s.paid_by === otherId && s.paid_to === userId) {
        txs.push({ id: s.id, date: d, monthKey: d.slice(0, 7), description: s.note || "Pago recibido", groupName: "", amount: -s.amount, isSettlement: true });
      }
    }
  }

  return txs.sort((a, b) => b.date.localeCompare(a.date));
}

function groupByDate(txs: PersonTx[]) {
  const order: string[] = [];
  const map = new Map<string, PersonTx[]>();
  for (const tx of txs) {
    const [y, m, d] = tx.date.split("-");
    const label = `${d}/${m}/${y}`;
    if (!map.has(label)) { order.push(label); map.set(label, []); }
    map.get(label)!.push(tx);
  }
  return order.map((label) => ({ label, txs: map.get(label)! }));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SaldosView({ people, expenses, settlements, invitations, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentMonth = useMemo(() => toMonthKey(new Date()), []);

  // ── Caja común ────────────────────────────────────────────────────────────
  const hasCajaComun = expenses.some(
    (e) => e.paid_by === null && e.splits.some((s) => s.user_id === userId)
  );
  const cajaComun: Profile = {
    id: CAJA_COMUN_ID,
    display_name: CAJA_COMUN_NAME,
    email: "",
    created_at: "",
    updated_at: "",
  };

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string>(
    people[0]?.id ?? (hasCajaComun ? CAJA_COMUN_ID : "")
  );
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [payOpen, setPayOpen]   = useState(false);
  const [amountRaw, setAmountRaw] = useState("");
  const [note, setNote]         = useState("");
  const [payError, setPayError] = useState("");

  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [expensePickerOpen, setExpensePickerOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen]   = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);

  // ── Notifications ─────────────────────────────────────────────────────────
  const storedTs = useSyncExternalStore(subscribeLastSeen, getLastSeenClient, getLastSeenServer);
  const [lastSeenOverride, setLastSeenOverride] = useState<string | null>(null);
  const lastSeenTs    = lastSeenOverride ?? storedTs;
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

  // ── Groups for expense picker ─────────────────────────────────────────────
  const uniqueGroups = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const e of expenses) {
      if (!seen.has(e.group_id)) seen.set(e.group_id, { id: e.group_id, name: e.group.name });
    }
    return [...seen.values()];
  }, [expenses]);

  // ── Balance ───────────────────────────────────────────────────────────────
  const effectivePeople = useMemo(
    () => hasCajaComun ? [...people, cajaComun] : people,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, hasCajaComun]
  );

  const selectedPerson = useMemo(
    () => effectivePeople.find((p) => p.id === selectedId) ?? null,
    [effectivePeople, selectedId]
  );

  const allTxs = useMemo(
    () => selectedId ? computeMovements(expenses, settlements, userId, selectedId) : [],
    [expenses, settlements, userId, selectedId]
  );

  const availableMonths = useMemo(() => {
    const keys = new Set([currentMonth]);
    allTxs.forEach((t) => keys.add(t.monthKey));
    return [...keys].sort().reverse();
  }, [allTxs, currentMonth]);

  const filteredTxs = useMemo(
    () => allTxs.filter((t) => t.monthKey === selectedMonth),
    [allTxs, selectedMonth]
  );

  const filteredBalance = useMemo(
    () => filteredTxs.reduce((s, t) => s + t.amount, 0),
    [filteredTxs]
  );

  const dateGroups = groupByDate(filteredTxs);
  const iOweMonth  = filteredBalance < 0;

  const debtSign: "positive" | "negative" | "neutral" =
    filteredBalance > 0 ? "positive" :
    filteredBalance < 0 ? "negative" :
    "neutral";

  function selectPerson(id: string) {
    setSelectedId(id);
    setSelectedMonth(currentMonth);
  }

  function openPay() {
    setAmountRaw(String(Math.abs(filteredBalance)));
    setNote("");
    setPayError("");
    setPayOpen(true);
  }

  function closePay() {
    setPayOpen(false);
    setAmountRaw("");
    setNote("");
    setPayError("");
  }

  function handleConfirm() {
    if (!selectedId) return;
    const amount = parseInt(amountRaw.replace(/\D/g, "") || "0", 10);
    if (amount <= 0) { setPayError("Ingresa un monto válido"); return; }
    startTransition(async () => {
      const result = selectedId === CAJA_COMUN_ID
        ? await registerPendingPaymentAction(amount)
        : await registerPayment(selectedId, amount, note || undefined);
      if (result.error) { setPayError(result.error); return; }
      closePay();
      router.refresh();
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (people.length === 0 && !hasCajaComun) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Saldos</h1>
          <HeaderActions
            hasGroups={uniqueGroups.length > 0}
            notifBadge={totalBadge}
            onNewGroup={() => setNewGroupOpen(true)}
            onNewExpense={() => setExpensePickerOpen(true)}
            onNotif={() => setNotifOpen(true)}
          />
        </header>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Sin contactos</p>
          <p className={styles.emptyBody}>Únete a un grupo con más integrantes para ver saldos.</p>
        </div>
        <SaldosModals
          expensePickerOpen={expensePickerOpen}
          uniqueGroups={uniqueGroups}
          newGroupOpen={newGroupOpen}
          notifOpen={notifOpen}
          expenseNotifs={expenseNotifs}
          invitations={invitations}
          closeNotifs={closeNotifs}
          setExpensePickerOpen={setExpensePickerOpen}
          setNewGroupOpen={setNewGroupOpen}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Saldos</h1>
        <HeaderActions
          hasGroups={uniqueGroups.length > 0}
          notifBadge={totalBadge}
          onNewGroup={() => setNewGroupOpen(true)}
          onNewExpense={() => setExpensePickerOpen(true)}
          onNotif={() => setNotifOpen(true)}
        />
      </header>

      <div className={styles.content}>
        {/* Person selector */}
        {effectivePeople.length >= 2 && (
          <button className={styles.personSelectorBtn} onClick={() => setPersonPickerOpen(true)}>
            {selectedId === CAJA_COMUN_ID ? (
              <svg className={styles.personSelectorIcon} width="16" height="16" viewBox="0 0 20 20" fill="none">
                <circle cx="6" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M1 17c0-3 2.2-4.5 5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M19 17c0-3-2.2-4.5-5-4.5s-5 1.5-5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg className={styles.personSelectorIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M2 14c0-3 2.686-4.5 6-4.5s6 1.5 6 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
            <span className={styles.personSelectorName}>{selectedPerson?.display_name ?? "Seleccionar persona"}</span>
            <svg className={styles.personSelectorChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        {/* Balance card */}
        <BalanceCard
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          showPicker={availableMonths.length > 1}
          onMonthChange={setSelectedMonth}
          monthLabel={monthLabel}
          expenseCount={filteredTxs.length}
          totalAmount={Math.abs(filteredBalance)}
          countSuffix="MOVIMIENTO"
          debtLabel={
            filteredTxs.length > 0 || Math.abs(filteredBalance) > 0
              ? filteredBalance > 0 ? "TE DEBE"
              : filteredBalance < 0 ? "DEBES"
              : "TODO AL DÍA"
              : undefined
          }
          debtSign={debtSign}
        />

        {/* Pay button */}
        {iOweMonth && (
          <button className={styles.payBtn} onClick={openPay}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Registrar pago
          </button>
        )}

        {/* Transaction list */}
        {filteredTxs.length === 0 ? (
          <p className={styles.emptyMonth}>
            {selectedId === CAJA_COMUN_ID
              ? "Sin gastos pendientes este mes."
              : `Sin movimientos este mes con ${selectedPerson?.display_name?.split(" ")[0]}.`}
          </p>
        ) : (
          dateGroups.map(({ label, txs }) => (
            <section key={label} className={styles.dateGroup}>
              <p className={styles.dateLabel}>{label}</p>
              <div className={styles.txList}>
                {txs.map((tx) => tx.isSettlement ? (
                  <div key={tx.id} className={styles.txRow}>
                    <div className={styles.txLeft}>
                      <p className={styles.txDesc}>{tx.description}</p>
                    </div>
                    <div className={styles.txRight}>
                      <span className={`${styles.txAmount} ${tx.amount > 0 ? styles.txPos : styles.txNeg}`}>
                        {tx.amount > 0 ? "+" : ""}{formatCLP(tx.amount)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Link key={tx.id} href={`/activity/${tx.id}`} className={styles.txRow}>
                    <div className={styles.txLeft}>
                      <p className={styles.txDesc}>{tx.description}</p>
                      {tx.groupName && <span className={styles.txGroupBadge}>{tx.groupName}</span>}
                    </div>
                    <div className={styles.txRight}>
                      <span className={`${styles.txAmount} ${tx.amount > 0 ? styles.txPos : styles.txNeg}`}>
                        {tx.amount > 0 ? "+" : ""}{formatCLP(tx.amount)}
                      </span>
                      <svg className={styles.txChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Person picker */}
      {personPickerOpen && (
        <div className={styles.backdrop} onClick={() => setPersonPickerOpen(false)} role="dialog" aria-modal="true" aria-label="Seleccionar persona">
          <div className={styles.actionSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.actionSheetHeader}>
              <p className={styles.actionSheetTitle}>Seleccionar persona</p>
              <button className={styles.closeBtn} onClick={() => setPersonPickerOpen(false)} aria-label="Cerrar">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            {people.map((p) => (
              <button
                key={p.id}
                className={styles.actionSheetItem}
                onClick={() => { selectPerson(p.id); setPersonPickerOpen(false); }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: "0.5rem", flexShrink: 0 }}>
                  <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M2 14c0-3 2.686-4.5 6-4.5s6 1.5 6 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                {p.display_name}
              </button>
            ))}
            {hasCajaComun && (
              <>
                {people.length > 0 && <div className={styles.pickerDivider} />}
                <button
                  className={`${styles.actionSheetItem} ${styles.actionSheetItemMuted}`}
                  onClick={() => { selectPerson(CAJA_COMUN_ID); setPersonPickerOpen(false); }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ marginRight: "0.5rem", flexShrink: 0 }}>
                    <circle cx="6" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1 17c0-3 2.2-4.5 5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M19 17c0-3-2.2-4.5-5-4.5s-5 1.5-5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  {CAJA_COMUN_NAME}
                </button>
              </>
            )}
            <button className={`${styles.actionSheetItem} ${styles.actionSheetCancel}`} onClick={() => setPersonPickerOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <SaldosModals
        expensePickerOpen={expensePickerOpen}
        uniqueGroups={uniqueGroups}
        newGroupOpen={newGroupOpen}
        notifOpen={notifOpen}
        expenseNotifs={expenseNotifs}
        invitations={invitations}
        closeNotifs={closeNotifs}
        setExpensePickerOpen={setExpensePickerOpen}
        setNewGroupOpen={setNewGroupOpen}
      />

      <SettlementModal
        open={payOpen}
        onClose={closePay}
        subtitle={selectedId === CAJA_COMUN_ID ? "Gastos pendientes de pago" : `A ${selectedPerson?.display_name ?? "…"}`}
        amountRaw={amountRaw}
        onAmountChange={setAmountRaw}
        note={note}
        onNoteChange={setNote}
        maxAmount={Math.abs(filteredBalance)}
        error={payError}
        pending={isPending}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

// ── Saldos modals ─────────────────────────────────────────────────────────────

function SaldosModals({
  expensePickerOpen,
  uniqueGroups,
  newGroupOpen,
  notifOpen,
  expenseNotifs,
  invitations,
  closeNotifs,
  setExpensePickerOpen,
  setNewGroupOpen,
}: {
  expensePickerOpen: boolean;
  uniqueGroups: { id: string; name: string }[];
  newGroupOpen: boolean;
  notifOpen: boolean;
  expenseNotifs: ExpenseWithDetails[];
  invitations: PendingInvitation[];
  closeNotifs: () => void;
  setExpensePickerOpen: (v: boolean) => void;
  setNewGroupOpen: (v: boolean) => void;
}) {
  return (
    <>
      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />

      <GroupPickerModal
        open={expensePickerOpen}
        onClose={() => setExpensePickerOpen(false)}
        groups={uniqueGroups}
      />

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
    </>
  );
}
