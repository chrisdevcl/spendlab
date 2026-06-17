"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { GroupWithMembers } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import { createExpense } from "../../actions";
import styles from "./new-expense-form.module.css";

interface Props {
  groupId: string;
  allGroups: GroupWithMembers[];
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

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewExpenseForm({
  groupId,
  allGroups,
  userId,
}: Props) {
  const router = useRouter();
  const today  = todayLocal();

  // ── Group selection ────────────────────────────────────────────────────────
  const selectedGroupId = groupId;
  const currentGroup = useMemo(
    () => allGroups.find((g) => g.id === selectedGroupId) ?? allGroups[0],
    [allGroups, selectedGroupId]
  );
  const members = useMemo(() => currentGroup?.members ?? [], [currentGroup]);
  const isSolo  = members.length === 1;

  // ── Amount ─────────────────────────────────────────────────────────────────
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
  const [date, setDate]   = useState<string>(today);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [hasPayer, setHasPayer] = useState(false);
  const [dividir, setDividir] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(members.map((m) => m.id))
  );

  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isToday = date === today;

  function toggleHasPayer(on: boolean) {
    setHasPayer(on);
    if (on) {
      setPaidBy(userId);
    } else {
      setPaidBy(null);
      setDividir(true);
    }
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Split preview ──────────────────────────────────────────────────────────
  const splits = useMemo<Record<string, number>>(() => {
    let eligible = members.filter((m) => selectedIds.has(m.id));
    if (!dividir && paidBy) {
      eligible = eligible.filter((m) => m.id !== paidBy);
    }
    if (!eligible.length || amountValue === 0) return {};
    const base      = Math.floor(amountValue / eligible.length);
    const remainder = amountValue % eligible.length;
    return Object.fromEntries(
      eligible.map((m, i) => [m.id, base + (i < remainder ? 1 : 0)])
    );
  }, [amountValue, members, selectedIds, dividir, paidBy]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const canSave = amountValue > 0 && description.trim().length > 0 && selectedIds.size > 0;

  function handleSave() {
    if (!canSave) return;
    setError("");
    startTransition(async () => {
      const effectivePaidBy = isSolo ? (members[0]?.id ?? userId) : paidBy;
      const memberIds = isSolo
        ? members.map((m) => m.id)
        : !dividir && paidBy
        ? Array.from(selectedIds).filter((id) => id !== paidBy)
        : Array.from(selectedIds);
      const result = await createExpense(
        selectedGroupId,
        effectivePaidBy,
        amountValue,
        description,
        memberIds,
        date
      );
      if (result?.error) setError(result.error);
    });
  }

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
        <h1 className={styles.title}>Nuevo gasto</h1>
      </header>

      <div className={styles.scrollArea}>

        {/* ── Amount card ─────────────────────────────────────────────── */}
        <div className={styles.amountSection}>
          <div className={styles.amountCard}>
            <p className={styles.amountLabel}>Monto total</p>
            <div
              className={styles.amountDisplay}
              onClick={() => amountInputRef.current?.focus()}
            >
              {formatAmountDisplay(amountValue)}
            </div>
            {/* Hidden input receives keyboard entry */}
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
              {[1000, 5000, 10000].map((n) => (
                <button
                  key={n}
                  className={styles.quickChip}
                  onClick={() => addQuick(n)}
                  disabled={isPending}
                >
                  +{formatCLP(n)}
                </button>
              ))}
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
          </div>
        </div>


        {/* ── Description ─────────────────────────────────────────────── */}
        <div className={styles.formSection}>
          <p className={styles.sectionLabel}>Descripción</p>
          <input
            className={styles.descInput}
            type="text"
            placeholder="Ej: Supermercado Jumbo"
            value={description}
            maxLength={100}
            disabled={isPending}
            onChange={(e) => {
              setDescription(e.target.value);
              if (error) setError("");
            }}
          />
        </div>

        {/* ── Date ────────────────────────────────────────────────────── */}
        <div className={styles.formSection}>
          <div className={styles.sectionLabelRow}>
            <p className={styles.sectionLabel}>Fecha</p>
            {isToday && <span className={styles.sectionHint}>Hoy</span>}
          </div>
          <input
            className={styles.dateInput}
            type="date"
            value={date}
            max={`${new Date().getFullYear() + 1}-12-31`}
            disabled={isPending}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* ── Payer + splits (hidden in solo mode) ────────────────────── */}
        {!isSolo && (
          <>
            {/* ¿Quién pagó? toggle */}
            <div className={styles.formSection}>
              <div className={styles.toggleRow}>
                <p className={styles.sectionLabel}>¿Quién pagó?</p>
                <button
                  role="switch"
                  aria-checked={hasPayer}
                  className={`${styles.toggle} ${hasPayer ? styles.toggleOn : ""}`}
                  onClick={() => toggleHasPayer(!hasPayer)}
                  disabled={isPending}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
              {!hasPayer && (
                <div className={styles.payerPending}>Pendiente de pago</div>
              )}
              {hasPayer && (
                <div className={styles.payerGrid}>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      className={`${styles.payerBtn} ${paidBy === m.id ? styles.payerBtnActive : ""}`}
                      onClick={() => setPaidBy(m.id)}
                      disabled={isPending}
                    >
                      {m.display_name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dividir toggle + member list */}
            <div className={styles.formSection}>
              <div className={styles.toggleRow}>
                <p className={styles.sectionLabel}>Dividir</p>
                {hasPayer && (
                  <button
                    role="switch"
                    aria-checked={dividir}
                    className={`${styles.toggle} ${dividir ? styles.toggleOn : ""}`}
                    onClick={() => setDividir((d) => !d)}
                    disabled={isPending}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                )}
              </div>
              <div className={styles.memberList}>
                {members.map((m) => {
                  const isExcluded = !dividir && m.id === paidBy;
                  const checked    = selectedIds.has(m.id);
                  const shareAmt   = splits[m.id];
                  const initials   = (m.display_name[0] ?? "?").toUpperCase();
                  return (
                    <div
                      key={m.id}
                      className={`${styles.memberRow} ${isExcluded ? styles.memberRowMuted : ""}`}
                      onClick={() => !isPending && !isExcluded && toggleMember(m.id)}
                    >
                      <div className={styles.memberAvatar}>{initials}</div>
                      <p className={styles.memberName}>{m.display_name.split(" ")[0]}</p>
                      {isExcluded ? (
                        <>
                          <p className={styles.memberShareMuted}>Pagador</p>
                          <span />
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
          {isPending ? (
            "Guardando…"
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8.5l4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Guardar gasto
            </>
          )}
        </button>
      </div>
    </div>
  );
}
