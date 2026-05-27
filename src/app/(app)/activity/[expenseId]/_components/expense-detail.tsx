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
import { createSettlementFromExpense } from "../actions";
import styles from "./expense-detail.module.css";

interface Props {
  expense: ExpenseWithDetails;
  settlements: Settlement[];
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr.length === 10 ? dateStr : dateStr.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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
  const mySplit = expense.splits.find((s) => s.user_id === userId);
  const userHasDebt =
    mySplit !== undefined && mySplit.user_id !== payerId
      ? isDebtPending(settlements, userId, payerId, mySplit.amount)
      : false;

  const debtAmount =
    userHasDebt && mySplit
      ? mySplit.amount - settledAmount(settlements, userId, payerId)
      : 0;

  // ── Settlement modal ────────────────────────────────────────────────────────
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleRaw, setSettleRaw] = useState("");
  const [settleError, setSettleError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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
        payerId,
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

  const payerName =
    expense.payer?.display_name ?? "Desconocido";

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
        <span className={styles.headerTitle}>Detalle de gasto</span>
        <div style={{ width: 38 }} />
      </header>

      <div className={styles.content}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className={styles.hero}>
          <p className={styles.heroAmount}>{formatCLP(expense.amount)}</p>
          <p className={styles.heroDesc}>{expense.description}</p>
          <span className={styles.groupBadge}>{expense.group.name}</span>
        </div>

        {/* ── Metadata card ─────────────────────────────────────────────── */}
        <div className={styles.metaCard}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Fecha</span>
            <span className={styles.metaValue}>
              {formatDate(expense.expense_date)}
            </span>
          </div>
          <div className={`${styles.metaRow} ${styles.metaLast}`}>
            <span className={styles.metaLabel}>Pagó</span>
            <div className={styles.payerCell}>
              <div className={styles.avatarXs}>
                {payerName[0]?.toUpperCase() ?? "?"}
              </div>
              <span className={styles.metaValue}>{payerName}</span>
            </div>
          </div>
        </div>

        {/* ── Splits ────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>División del gasto</p>
          <div className={styles.splitList}>
            {expense.splits.map((split) => {
              const name = split.profile?.display_name ?? split.user_id;
              const isPayer = split.user_id === payerId;
              const isMe = split.user_id === userId;

              // Determine debt status for this split participant
              let settled: boolean;
              if (isPayer) {
                settled = true; // payer always "settled" for their own share
              } else {
                const paid = settledAmount(settlements, split.user_id, payerId);
                settled = paid >= split.amount;
              }

              return (
                <div key={split.id} className={styles.splitRow}>
                  <div className={styles.splitAvatar}>
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className={styles.splitInfo}>
                    <p className={styles.splitName}>
                      {isMe ? "Tú" : name.split(" ")[0]}
                      {isPayer && (
                        <span className={styles.payerTag}> · Pagó</span>
                      )}
                    </p>
                  </div>
                  <p className={styles.splitAmount}>{formatCLP(split.amount)}</p>
                  <span
                    className={`${styles.splitStatus} ${settled ? styles.splitSettled : styles.splitPending}`}
                  >
                    {settled ? "Sin deuda" : "Pendiente"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Info banner (only if current user has pending debt) ───────── */}
        {userHasDebt && (
          <div className={styles.infoBanner}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 8v5M9 6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p>
              Tienes una deuda pendiente de{" "}
              <strong>{formatCLP(debtAmount)}</strong> con{" "}
              {payerName.split(" ")[0]}.
            </p>
          </div>
        )}
      </div>

      {/* ── Pay footer (only if user has debt) ──────────────────────────── */}
      {userHasDebt && (
        <div className={styles.payFooter}>
          <button
            className={styles.payBtn}
            onClick={() => { setSettleRaw(String(debtAmount)); setSettleOpen(true); }}
          >
            Registrar pago a {payerName.split(" ")[0]}
          </button>
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
