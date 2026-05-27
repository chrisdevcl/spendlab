"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { createExpense } from "../../actions";
import styles from "./new-expense-form.module.css";

interface Props {
  groupId: string;
  groupName: string;
  members: Profile[];
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  return parseInt(raw.replace(/\D/g, "") || "0", 10);
}

function formatAmountDisplay(n: number): string {
  if (n === 0) return "$0";
  return formatCLP(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewExpenseForm({
  groupId,
  groupName,
  members,
  userId,
}: Props) {
  const router = useRouter();

  // Modo individual: 1 solo integrante → sin selector de pagador ni de participantes
  const isSolo = members.length === 1;

  // ── Amount state ───────────────────────────────────────────────────────────
  const [rawAmount, setRawAmount] = useState("0");
  const amountValue = parseAmount(rawAmount);
  const amountInputRef = useRef<HTMLInputElement>(null);

  function addQuick(n: number) {
    setRawAmount((prev) => String(parseAmount(prev) + n));
  }

  function clearAmount() {
    setRawAmount("0");
    amountInputRef.current?.focus();
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState(userId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(members.map((m) => m.id))
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // mínimo 1
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Real-time split preview ────────────────────────────────────────────────
  const splits = useMemo<Record<string, number>>(() => {
    const selected = members.filter((m) => selectedIds.has(m.id));
    if (!selected.length || amountValue === 0) return {};
    const base = Math.floor(amountValue / selected.length);
    const remainder = amountValue % selected.length;
    return Object.fromEntries(
      selected.map((m, i) => [m.id, base + (i < remainder ? 1 : 0)])
    );
  }, [amountValue, members, selectedIds]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const canSave =
    amountValue > 0 && description.trim().length > 0 && selectedIds.size > 0;

  function handleSave() {
    if (!canSave) return;
    setError("");
    startTransition(async () => {
      const result = await createExpense(
        groupId,
        paidBy,
        amountValue,
        description,
        Array.from(selectedIds)
      );
      // redirect() in server action navigates away; we only reach here on error
      if (result?.error) setError(result.error);
    });
  }

  // Focus amount input on mount
  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <button
          className={styles.iconBtn}
          onClick={() => router.back()}
          aria-label="Cerrar"
          disabled={isPending}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className={styles.title}>
          Nuevo gasto
          {groupName && (
            <span className={styles.titleGroup}> · {groupName}</span>
          )}
        </h1>
      </header>

      <div className={styles.scrollArea}>
        {/* ── Amount display ──────────────────────────────────────────── */}
        <div className={styles.amountSection}>
          <div className={styles.amountCard}>
            <p className={styles.amountLabel}>Monto total</p>
            <div
              className={styles.amountDisplay}
              onClick={() => amountInputRef.current?.focus()}
            >
              {formatAmountDisplay(amountValue)}
            </div>
          {/* Hidden input handles keyboard entry */}
          <input
            ref={amountInputRef}
            className={styles.hiddenInput}
            type="text"
            inputMode="numeric"
            value={rawAmount === "0" ? "" : rawAmount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setRawAmount(digits || "0");
              if (error) setError("");
            }}
            aria-label="Monto del gasto"
          />
          <div className={styles.quickRow}>
            <button
              className={styles.quickChip}
              onClick={() => addQuick(1000)}
              disabled={isPending}
            >
              +$1.000
            </button>
            <button
              className={styles.quickChip}
              onClick={() => addQuick(5000)}
              disabled={isPending}
            >
              +$5.000
            </button>
            <button
              className={styles.quickChip}
              onClick={() => addQuick(10000)}
              disabled={isPending}
            >
              +$10.000
            </button>
            {amountValue > 0 && (
              <button
                className={`${styles.quickChip} ${styles.quickClear}`}
                onClick={clearAmount}
                disabled={isPending}
              >
                ✕
              </button>
            )}
          </div>
          </div>{/* /amountCard */}
        </div>

        {/* ── Description ─────────────────────────────────────────────── */}
        <div className={styles.fieldSection}>
          <input
            className={styles.descInput}
            type="text"
            placeholder="¿Qué fue? (ej: Supermercado)"
            value={description}
            maxLength={100}
            disabled={isPending}
            onChange={(e) => {
              setDescription(e.target.value);
              if (error) setError("");
            }}
          />
        </div>

        {/* ── Payer + participants (ocultos en modo solo) ──────────────── */}
        {!isSolo && (
          <>
            <section className={styles.formSection}>
              <p className={styles.sectionLabel}>¿Quién pagó?</p>
              <div className={styles.pillRow}>
                {members.map((m) => (
                  <button
                    key={m.id}
                    className={`${styles.pill} ${paidBy === m.id ? styles.pillActive : ""}`}
                    onClick={() => setPaidBy(m.id)}
                    disabled={isPending}
                  >
                    {m.display_name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.formSection}>
              <p className={styles.sectionLabel}>¿Quiénes participan?</p>
              <div className={styles.memberList}>
                {members.map((m, i) => {
                  const checked = selectedIds.has(m.id);
                  const shareAmt = splits[m.id];
                  return (
                    <div
                      key={m.id}
                      className={`${styles.memberRow} ${i === 0 ? styles.memberFirst : ""} ${i === members.length - 1 ? styles.memberLast : ""}`}
                      onClick={() => !isPending && toggleMember(m.id)}
                    >
                      <div className={styles.memberAvatar}>
                        {m.display_name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <p className={styles.memberName}>{m.display_name}</p>
                      <p className={`${styles.memberShare} ${checked ? styles.memberShareActive : ""}`}>
                        {checked && shareAmt != null ? formatCLP(shareAmt) : "—"}
                      </p>
                      <div className={`${styles.checkbox} ${checked ? styles.checkboxOn : ""}`}>
                        {checked && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>

      {/* ── Save footer ───────────────────────────────────────────────── */}
      <div className={styles.saveFooter}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!canSave || isPending}
        >
          {isPending ? "Guardando…" : "Guardar gasto"}
        </button>
      </div>
    </div>
  );
}
