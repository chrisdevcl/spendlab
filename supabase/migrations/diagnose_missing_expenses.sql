-- ============================================================
-- Diagnóstico: gastos que deberían aparecer en "Pendiente de pago"
-- ============================================================

-- 1. Estado de los 2 gastos reportados
SELECT
  e.id,
  e.description,
  e.expense_date,
  e.amount,
  e.paid_by,
  p.display_name   AS paid_by_name,
  e.created_at
FROM expenses e
LEFT JOIN profiles p ON p.id = e.paid_by
WHERE e.id IN (
  '2d275da8-b598-4df4-b55a-5b974e1f7d42',
  'a6ea3692-842b-4ebd-b0e4-e2799b01e085'
);

-- 2. Estado de sus splits (¿paid_amount == amount = marcado como pagado?)
SELECT
  es.id             AS split_id,
  es.expense_id,
  pr.display_name   AS participant,
  es.amount,
  es.paid_amount,
  es.amount - es.paid_amount  AS pendiente,
  es.paid_amount >= es.amount AS totalmente_pagado
FROM expense_splits es
JOIN profiles pr ON pr.id = es.user_id
WHERE es.expense_id IN (
  '2d275da8-b598-4df4-b55a-5b974e1f7d42',
  'a6ea3692-842b-4ebd-b0e4-e2799b01e085'
)
ORDER BY es.expense_id, pr.display_name;

-- 3. ¿Hay otros gastos con paid_by = NULL en la DB que tampoco aparecen?
SELECT
  e.id,
  e.description,
  e.expense_date,
  e.amount,
  COUNT(es.id)                              AS splits_total,
  SUM(es.paid_amount)                       AS total_pagado,
  e.amount - SUM(es.paid_amount)            AS total_pendiente
FROM expenses e
JOIN expense_splits es ON es.expense_id = e.id
WHERE e.paid_by IS NULL
GROUP BY e.id, e.description, e.expense_date, e.amount
ORDER BY e.expense_date DESC;
