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
import { formatCLP } from "@/lib/utils/currency";
import { deleteExpense as deleteExpenseAction, markExpenseAsPaid as markExpenseAsPaidAction, recordSplitPayment as recordSplitPaymentAction } from "../actions";
import styles from "./expense-detail.module.css";

interface Props {
  expense: ExpenseWithDetails;
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseDetail({
  expense,
  userId,
}: Props) {
  const router = useRouter();

  const payerId = expense.paid_by;
  const isPendingExpense = payerId === null;
  const mySplit = expense.splits.find((s) => s.user_id === userId);
  const isPersonal = isPendingExpense
    ? expense.splits.length === 0
    : expense.splits.length === 0 || expense.splits.every((s) => s.user_id === payerId);

  // User has debt when they have a non-payer split with remaining balance
  const userHasDebt =
    !isPersonal && mySplit !== undefined &&
    (isPendingExpense || mySplit.user_id !== payerId) &&
    mySplit.paid_amount < mySplit.amount;

  const debtAmount = userHasDebt && mySplit
    ? Math.max(0, mySplit.amount - mySplit.paid_amount)
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

  // ── Payment modal (unified for pending + shared expenses) ─────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payRaw, setPayRaw] = useState("");
  const [payError, setPayError] = useState("");
  const [isPendingPay, startPayTransition] = useTransition();
  const payInputRef = useRef<HTMLInputElement>(null);
  const payAmount = parseInt(payRaw.replace(/\D/g, "") || "0", 10);

  useEffect(() => {
    if (!payOpen) return;
    const t = setTimeout(() => payInputRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, [payOpen]);

  const closePay = useCallback(() => {
    if (isPendingPay) return;
    setPayOpen(false);
    setPayRaw("");
    setPayError("");
  }, [isPendingPay]);

  useEffect(() => {
    if (!payOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, closePay]);

  function handlePay() {
    if (payAmount <= 0 || !mySplit) return;
    startPayTransition(async () => {
      const result = await recordSplitPaymentAction(
        mySplit.id,
        payAmount,
        expense.id,
        expense.group_id
      );
      if (result.error) {
        setPayError(result.error);
      } else {
        setPayOpen(false);
        setPayRaw("");
        router.refresh();
      }
    });
  }

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
            {!isPersonal && !isPendingExpense && (
              <span className={styles.typeBadgeShared}>Compartido</span>
            )}
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
              <div className={`${styles.metaRow} ${styles.metaLast}`}>
                <span className={styles.metaLabel}>Fecha</span>
                <span className={styles.metaValue}>
                  {formatDate(expense.expense_date)}
                </span>
              </div>
            </div>

            {/* Splits */}
            <section className={styles.section}>
              <p className={styles.sectionLabel}>División del gasto</p>
              <div className={styles.splitList}>
                {expense.splits.map((split) => {
                  const name = split.profile?.display_name ?? split.user_id;
                  const isPayer = !isPendingExpense && split.user_id === payerId;
                  const settled = isPayer ? true : split.paid_amount >= split.amount;
                  const remaining = isPayer ? 0 : Math.max(0, split.amount - split.paid_amount);

                  return (
                    <div key={split.id} className={styles.splitRow}>
                      <div className={styles.splitAvatar}>
                        {name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className={styles.splitInfo}>
                        <p className={styles.splitName}>{name.split(" ")[0]}</p>
                        <div className={styles.splitStatusRow}>
                          <span className={`${styles.splitStatusBadge} ${settled ? styles.splitSettled : styles.splitPending}`}>
                            {settled ? "AL DÍA" : "DEBE"}
                          </span>
                        </div>
                      </div>
                      <div className={styles.splitAmountCol}>
                        <p className={styles.splitAmount}>{formatCLP(split.amount)}</p>
                        {!settled && remaining > 0 && (
                          <span className={styles.splitAmountChip}>-{formatCLP(remaining)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>


            {/* ── Payment history ──────────────────────────────────────── */}
            {isPendingExpense ? (
              // Pending: show individual abono records per split
              (() => {
                const allPayments = expense.splits.flatMap((s) =>
                  (s.payments ?? []).map((p) => ({
                    ...p,
                    profileName: s.profile?.display_name ?? s.user_id,
                  }))
                ).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
                if (!allPayments.length) return null;
                return (
                  <section className={styles.section}>
                    <p className={styles.sectionLabel}>Historial de pagos</p>
                    <div className={styles.paymentList}>
                      {allPayments.map((p) => (
                        <div key={p.id} className={styles.paymentRow}>
                          <div className={styles.splitAvatar}>
                            {p.profileName[0]?.toUpperCase() ?? "?"}
                          </div>
                          <p className={styles.paymentName}>{p.profileName.split(" ")[0]}</p>
                          <p className={styles.paymentDate}>{formatDate(p.paid_at)}</p>
                          <p className={styles.paymentAmount}>{formatCLP(p.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()
            ) : (
              // Shared: show split_payments for non-payer splits
              (() => {
                const allPayments = expense.splits
                  .filter((s) => s.user_id !== payerId)
                  .flatMap((s) =>
                    (s.payments ?? []).map((p) => ({
                      ...p,
                      profileName: s.profile?.display_name ?? s.user_id,
                    }))
                  )
                  .sort((a, b) => a.paid_at.localeCompare(b.paid_at));
                if (!allPayments.length) return null;
                return (
                  <section className={styles.section}>
                    <p className={styles.sectionLabel}>Historial de pagos</p>
                    <div className={styles.paymentList}>
                      {allPayments.map((p) => (
                        <div key={p.id} className={styles.paymentRow}>
                          <div className={styles.splitAvatar}>
                            {p.profileName[0]?.toUpperCase() ?? "?"}
                          </div>
                          <p className={styles.paymentName}>{p.profileName.split(" ")[0]}</p>
                          <p className={styles.paymentDate}>{formatDate(p.paid_at)}</p>
                          <p className={styles.paymentAmount}>{formatCLP(p.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()
            )}

          </>
        )}
      </div>

      {/* ── Pay footer ───────────────────────────────────────────────────── */}
      {userHasDebt && (
        <div className={styles.payFooter}>
          <button
            className={styles.payBtn}
            onClick={() => { setPayRaw(String(debtAmount)); setPayOpen(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Registrar pago
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

      {/* ── Payment modal (pending + shared) ──────────────────────────────── */}
      {payOpen && mySplit && (
        <div
          className={styles.backdrop}
          onClick={closePay}
          role="dialog"
          aria-modal="true"
          aria-label="Registrar pago"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>Registrar pago</p>
            <p className={styles.modalSub}>Pendiente: {formatCLP(debtAmount)}</p>
            <input
              ref={payInputRef}
              className={styles.modalInput}
              type="text"
              inputMode="numeric"
              placeholder="Monto a pagar"
              value={payRaw
                ? new Intl.NumberFormat("es-CL").format(parseInt(payRaw.replace(/\D/g, "") || "0", 10))
                : ""}
              disabled={isPendingPay}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const num = parseInt(digits || "0", 10);
                setPayRaw(num > debtAmount ? String(debtAmount) : digits);
                if (payError) setPayError("");
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePay(); }}
            />
            {payError && <p className={styles.modalError}>{payError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={closePay} disabled={isPendingPay}>
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={handlePay}
                disabled={isPendingPay || payAmount <= 0}
              >
                {isPendingPay ? "Registrando…" : "Confirmar"}
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

    </div>
  );
}
