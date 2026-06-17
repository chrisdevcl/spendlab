"use client";

import {
  useState,
  useTransition,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import type { ExpenseWithDetails } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import { deleteExpense as deleteExpenseAction, markExpenseAsPaid as markExpenseAsPaidAction } from "../actions";
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
  const canEdit = expense.created_by === userId;

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
        {canEdit || canDelete ? (
          <div className={styles.headerActions}>
            {canEdit && (
              <button
                className={styles.iconBtn}
                onClick={() => router.push(`/activity/${expense.id}/edit`)}
                aria-label="Editar gasto"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M11.5 2.5l3 3-8.5 8.5H3v-3l8.5-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {canDelete && (
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
            )}
          </div>
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
              <span className={styles.typeBadgeShared}>Dividido</span>
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

                  return (
                    <div key={split.id} className={styles.splitRow}>
                      <div className={styles.splitAvatar}>
                        {name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className={styles.splitInfo}>
                        <p className={styles.splitName}>{name.split(" ")[0]}</p>
                        {isPayer && (
                          <p className={styles.splitMeta}>Pagó</p>
                        )}
                      </div>
                      <p className={styles.splitAmount}>{formatCLP(split.amount)}</p>
                    </div>
                  );
                })}
              </div>
            </section>



          </>
        )}
      </div>

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
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>¿Eliminar gasto?</p>
              <button className={styles.closeBtn} onClick={closeDelete} aria-label="Cerrar" disabled={isPendingDelete}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
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
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>¿Quién pagó?</p>
              <button className={styles.closeBtn} onClick={() => { setMarkPaidOpen(false); setMarkPaidError(""); }} aria-label="Cerrar" disabled={isPendingMarkPaid}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
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
