"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import type { ExpenseWithDetails } from "@/types";
import type { Settlement } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { createSettlementFromExpense, deleteExpense as deleteExpenseAction, markExpenseAsPaid as markExpenseAsPaidAction } from "../actions";
import styles from "./expense-detail.module.css";

interface Props {
  expense: ExpenseWithDetails;
  settlements: Settlement[];
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Total settlements paid from `fromId` to `toId` */
function settledAmount(
  settlements: Settlement[],
  fromId: string,
  toId: string
): number {
  return settlements
    .filter((s) => s.paid_by === fromId && s.paid_to === toId)
    .reduce((sum, s) => sum + s.amount, 0);
}

/** Whether `userId` still owes `payerId` for `splitAmount` after settlements */
function isDebtPending(
  settlements: Settlement[],
  userId: string,
  payerId: string,
  splitAmount: number
): boolean {
  if (userId === payerId) return false;
  const paid = settledAmount(settlements, userId, payerId);
  return paid < splitAmount;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseDetail({
  expense,
  settlements,
  userId,
}: Props) {
  const router = useRouter();

  const payerId = expense.paid_by;
  const isPendingExpense = payerId === null;
  const mySplit = expense.splits.find((s) => s.user_id === userId);
  const isPersonal = expense.splits.length <= 1;

  const userHasDebt =
    !isPersonal && !isPendingExpense && mySplit !== undefined && mySplit.user_id !== payerId
      ? isDebtPending(settlements, userId, payerId!, mySplit.amount)
      : false;

  const debtAmount =
    userHasDebt && mySplit
      ? mySplit.amount - settledAmount(settlements, userId, payerId!)
      : 0;

  // ── Delete expense ─────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  const closeDelete = useCallback(() => {
    if (isPendingDelete) return;
    setDeleteOpen(false);
  }, [isPendingDelete]);

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteExpenseAction(expense.id, expense.group_id);
      router.replace(`/groups/${expense.group_id}`);
    });
  }

  // ── Settlement modal ────────────────────────────────────────────────────────
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleRaw, setSettleRaw] = useState("");
  const [settleError, setSettleError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Mark as paid modal ─────────────────────────────────────────────────────
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidBy, setMarkPaidBy] = useState<string>(
    mySplit?.user_id ?? expense.splits[0]?.user_id ?? ""
  );
  const [markPaidError, setMarkPaidError] = useState("");
  const [isPendingMarkPaid, startMarkPaidTransition] = useTransition();

  function handleMarkPaid() {
    if (!markPaidBy) return;
    startMarkPaidTransition(async () => {
      const result = await markExpenseAsPaidAction(
        expense.id,
        expense.group_id,
        markPaidBy,
        expense.description,
        expense.amount
      );
      if (result.error) {
        setMarkPaidError(result.error);
      } else {
        setMarkPaidOpen(false);
        router.refresh();
      }
    });
  }

  const settleAmount = parseInt(settleRaw.replace(/\D/g, "") || "0", 10);

  useEffect(() => {
    if (!settleOpen) return;
    const t = setTimeout(() => inputRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, [settleOpen]);

  const closeSettle = useCallback(() => {
    if (isPending) return;
    setSettleOpen(false);
    setSettleRaw("");
    setSettleError("");
  }, [isPending]);

  useEffect(() => {
    if (!settleOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settleOpen, closeSettle]);

  function handleSettle() {
    if (settleAmount <= 0) {
      setSettleError("Ingresa un monto válido");
      return;
    }
    startTransition(async () => {
      const result = await createSettlementFromExpense(
        expense.group_id,
        userId,
        payerId!,
        settleAmount
      );
      if (result.error) {
        setSettleError(result.error);
      } else {
        setSettleOpen(false);
        router.refresh();
      }
    });
  }

  const payerName = expense.payer?.display_name ?? (isPendingExpense ? "Sin pagar" : "Desconocido");
  const canDelete = expense.paid_by === userId || expense.created_by === userId;

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <button
          className={styles.iconBtn}
          onClick={() => router.back()}
          aria-label="Volver"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 16L7 10L12.5 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className={styles.headerTitle}>Detalle del gasto</span>
        {canDelete ? (
          <button
            className={styles.iconBtnDanger}
            onClick={() => setDeleteOpen(true)}
            aria-label="Eliminar gasto"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 5V3h4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 5l.75 10.5h6.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div style={{ width: 38 }} />
        )}
      </header>

      <div className={styles.content}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className={styles.hero}>
          <p className={styles.heroAmount}>{formatCLP(expense.amount)}</p>
          <p className={styles.heroDesc}>{expense.description}</p>
          <div className={styles.heroBadgeRow}>
            <span className={styles.groupBadge}>{expense.group.name}</span>
            <span className={styles.categoryBadge}>Sin categoría</span>
          </div>
        </div>

        {isPersonal ? (
          /* ── Personal expense ───────────────────────────────────────── */
          <>
            <div className={styles.metaCard}>
              <div className={`${styles.metaRow} ${styles.metaLast}`}>
                <span className={styles.metaLabel}>Fecha</span>
                <span className={styles.metaValue}>
                  {formatDate(expense.expense_date)}
                </span>
              </div>
            </div>

            <p className={styles.personalNote}>Gasto personal — sin división ni deudas.</p>
          </>
        ) : (
          /* ── Shared expense ─────────────────────────────────────────── */
          <>
            {/* Metadata card */}
            <div className={styles.metaCard}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Fecha</span>
                <span className={styles.metaValue}>
                  {formatDate(expense.expense_date)}
                </span>
              </div>
              <div className={`${styles.metaRow} ${styles.metaLast}`}>
                <span className={styles.metaLabel}>Pagó</span>
                {isPendingExpense ? (
                  <span className={styles.pendingBadge}>Sin pagar</span>
                ) : (
                  <div className={styles.payerCell}>
                    <div className={styles.avatarXs}>
                      {payerName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className={styles.metaValue}>{payerName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Splits */}
            <section className={styles.section}>
              <p className={styles.sectionLabel}>División del gasto</p>
              <div className={styles.splitList}>
                {expense.splits.map((split) => {
                  const name = split.profile?.display_name ?? split.user_id;
                  const isPayer = !isPendingExpense && split.user_id === payerId;
                  let settled: boolean;
                  if (isPendingExpense) {
                    settled = false;
                  } else if (isPayer) {
                    settled = true;
                  } else {
                    const paid = settledAmount(settlements, split.user_id, payerId!);
                    settled = paid >= split.amount;
                  }

                  return (
                    <div key={split.id} className={styles.splitRow}>
                      <div className={styles.splitAvatar}>
                        {name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className={styles.splitInfo}>
                        <p className={styles.splitName}>{name.split(" ")[0]}</p>
                      </div>
                      <p className={styles.splitAmount}>{formatCLP(split.amount)}</p>
                      <span
                        className={`${styles.splitStatus} ${settled ? styles.splitSettled : styles.splitPending}`}
                      >
                        {settled ? "sin deuda" : "pendiente"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Info banner */}
            {userHasDebt && (
              <div className={styles.infoBanner}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9 8v5M9 6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p>
                  Le debes{" "}
                  <strong>{formatCLP(debtAmount)}</strong>{" "}
                  a {payerName.split(" ")[0]} por este gasto.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Pay footer ───────────────────────────────────────────────────── */}
      {isPendingExpense && !isPersonal && (
        <div className={styles.payFooter}>
          <button
            className={styles.payBtn}
            onClick={() => setMarkPaidOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Marcar como pagado
          </button>
        </div>
      )}
      {userHasDebt && (
        <div className={styles.payFooter}>
          <button
            className={styles.payBtn}
            onClick={() => { setSettleRaw(String(debtAmount)); setSettleOpen(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Registrar pago a {payerName.split(" ")[0]}
          </button>
        </div>
      )}

      {/* ── Delete confirmation modal ────────────────────────────────────── */}
      {deleteOpen && (
        <div
          className={styles.backdrop}
          onClick={closeDelete}
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar gasto"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>¿Eliminar gasto?</p>
            <p className={styles.modalSub}>
              Se eliminará &ldquo;{expense.description}&rdquo; ({formatCLP(expense.amount)}).
              Esta acción no se puede deshacer.
            </p>
            {settlements.length > 0 && (
              <p className={styles.modalWarn}>
                ⚠️ Este grupo tiene pagos registrados. Al eliminar el gasto los saldos se recalcularán — revisa que las deudas queden correctas antes de registrar nuevos pagos.
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={closeDelete}
                disabled={isPendingDelete}
              >
                Cancelar
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleDelete}
                disabled={isPendingDelete}
              >
                {isPendingDelete ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as paid modal ──────────────────────────────────────────── */}
      {markPaidOpen && (
        <div
          className={styles.backdrop}
          onClick={() => { if (!isPendingMarkPaid) setMarkPaidOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Marcar como pagado"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>¿Quién pagó?</p>
            <p className={styles.modalSub}>Selecciona quién adelantó el dinero.</p>
            <div className={styles.payerGrid}>
              {expense.splits.map((split) => {
                const name = split.profile?.display_name ?? split.user_id;
                return (
                  <button
                    key={split.user_id}
                    className={`${styles.payerBtn} ${markPaidBy === split.user_id ? styles.payerBtnActive : ""}`}
                    onClick={() => setMarkPaidBy(split.user_id)}
                    disabled={isPendingMarkPaid}
                  >
                    {name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
            {markPaidError && (
              <p className={styles.modalError}>{markPaidError}</p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={() => { setMarkPaidOpen(false); setMarkPaidError(""); }}
                disabled={isPendingMarkPaid}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={handleMarkPaid}
                disabled={isPendingMarkPaid || !markPaidBy}
              >
                {isPendingMarkPaid ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settlement modal ─────────────────────────────────────────────── */}
      {settleOpen && (
        <div
          className={styles.backdrop}
          onClick={closeSettle}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>
              Pagar a {payerName.split(" ")[0]}
            </p>
            <p className={styles.modalSub}>
              Deuda pendiente: {formatCLP(debtAmount)}
            </p>
            <input
              ref={inputRef}
              className={styles.modalInput}
              type="text"
              inputMode="numeric"
              placeholder="Monto a pagar"
              value={settleRaw
                ? new Intl.NumberFormat("es-CL").format(
                    parseInt(settleRaw.replace(/\D/g, "") || "0", 10)
                  )
                : ""}
              disabled={isPending}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setSettleRaw(digits);
                if (settleError) setSettleError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSettle();
              }}
            />
            {settleError && (
              <p className={styles.modalError}>{settleError}</p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={closeSettle}
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={handleSettle}
                disabled={isPending || settleAmount <= 0}
              >
                {isPending ? "Registrando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
