-- ============================================================
-- Respalda todos los settlements actuales en una tabla legible
-- y luego los elimina para empezar desde cero.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Crear tabla de respaldo (drop si ya existe de un run anterior)
DROP TABLE IF EXISTS settlements_backup;

CREATE TABLE settlements_backup AS
SELECT
  s.id,
  s.settled_at,
  s.amount,
  s.note,
  s.group_id,
  g.name                        AS group_name,
  s.paid_by,
  payer.display_name            AS paid_by_name,
  payer.email                   AS paid_by_email,
  s.paid_to,
  recipient.display_name        AS paid_to_name,
  recipient.email               AS paid_to_email
FROM settlements s
LEFT JOIN groups   g         ON g.id = s.group_id
LEFT JOIN profiles payer     ON payer.id = s.paid_by
LEFT JOIN profiles recipient ON recipient.id = s.paid_to
ORDER BY s.settled_at DESC;

-- 2. Verificar cuántos registros quedaron respaldados
SELECT COUNT(*) AS respaldados FROM settlements_backup;

-- 3. Vaciar settlements
DELETE FROM settlements;

-- 4. Confirmar que quedó vacío
SELECT COUNT(*) AS en_settlements FROM settlements;
