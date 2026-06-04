-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: settlements → split_payments
--
-- Qué hace:
--   1. Respalda la tabla settlements completa en settlements_backup.
--   2. Distribuye cada settlement a los splits correspondientes:
--      - busca splits donde user_id = paid_by y expense.paid_by = paid_to
--      - aplica el monto de más antiguo a más nuevo (expense_date ASC)
--      - crea registros en split_payments y actualiza paid_amount
--
-- Rollback:
--   Ver sección "ROLLBACK" al final del archivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Backup ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements_backup AS
  SELECT * FROM settlements;

-- ── 2. Migrar datos ───────────────────────────────────────────────────────────
DO $$
DECLARE
  s         RECORD;
  sp        RECORD;
  remaining INTEGER;
  to_pay    INTEGER;
BEGIN
  -- Procesar cada settlement de más antiguo a más nuevo
  FOR s IN SELECT * FROM settlements ORDER BY settled_at ASC LOOP
    remaining := s.amount;

    -- Buscar splits donde el deudor (paid_by) le debe al pagador (paid_to)
    FOR sp IN
      SELECT es.id, es.amount, es.paid_amount
      FROM   expense_splits es
      JOIN   expenses e ON e.id = es.expense_id
      WHERE  es.user_id    = s.paid_by
        AND  e.paid_by     = s.paid_to
        AND  e.group_id    = s.group_id
        AND  es.paid_amount < es.amount     -- solo splits con deuda pendiente
      ORDER  BY e.expense_date ASC, e.created_at ASC
    LOOP
      EXIT WHEN remaining <= 0;

      to_pay := LEAST(remaining, sp.amount - sp.paid_amount);
      IF to_pay > 0 THEN
        INSERT INTO split_payments (split_id, amount, paid_at)
        VALUES (sp.id, to_pay, s.settled_at);

        UPDATE expense_splits
        SET    paid_amount = paid_amount + to_pay
        WHERE  id = sp.id;

        remaining := remaining - to_pay;
      END IF;
    END LOOP;
    -- Nota: si remaining > 0 al final, el pago excedía las deudas actuales
    -- (overpayment). Se descarta porque no hay split al que asignarlo.
  END LOOP;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (ejecutar manualmente si es necesario)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Eliminar split_payments creados por la migración:
--    Los registros creados tienen paid_at = settled_at del settlement original.
--    settlements_backup sirve como fuente exacta para identificarlos sin necesidad
--    de guardar ningún timestamp externo.
--
--    DELETE FROM split_payments
--    WHERE paid_at IN (SELECT settled_at FROM settlements_backup);
--
-- 2. Revertir paid_amount de los splits afectados:
--    UPDATE expense_splits es
--    SET paid_amount = (
--      SELECT COALESCE(SUM(sp.amount), 0)
--      FROM split_payments sp
--      WHERE sp.split_id = es.id
--    );
--    (Recalcula desde split_payments restantes después del DELETE anterior)
--
-- 3. Restaurar tabla settlements desde backup si fue borrada:
--    INSERT INTO settlements SELECT * FROM settlements_backup
--    ON CONFLICT (id) DO NOTHING;
--
-- ═══════════════════════════════════════════════════════════════════════════
