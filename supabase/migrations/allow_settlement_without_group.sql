-- Allow settlements without a group (cross-group payments from Saldos).
-- group_id = NULL → pago registrado entre dos usuarios sin grupo específico.

-- 1. Quitar la restricción NOT NULL de group_id
ALTER TABLE settlements ALTER COLUMN group_id DROP NOT NULL;

-- 2. Actualizar políticas RLS para manejar group_id IS NULL

DROP POLICY IF EXISTS "settlements: members can read"   ON settlements;
DROP POLICY IF EXISTS "settlements: members can record" ON settlements;

-- Cualquier parte del pago puede leerlo (quien pagó o quien recibió),
-- o miembros del grupo si el pago tiene group_id.
CREATE POLICY "settlements: parties can read"
  ON settlements FOR SELECT TO authenticated
  USING (
    auth.uid() = paid_by
    OR auth.uid() = paid_to
    OR (group_id IS NOT NULL AND is_group_member(group_id))
  );

-- Solo quien paga puede registrar el pago.
-- Si tiene group_id debe ser miembro; si es NULL (desde Saldos) no se requiere grupo.
CREATE POLICY "settlements: payer can record"
  ON settlements FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = paid_by
    AND (group_id IS NULL OR is_group_member(group_id))
  );
