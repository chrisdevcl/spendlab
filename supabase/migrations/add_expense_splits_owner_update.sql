-- Allow the expense creator or payer to update expense_splits rows
-- belonging to other members. Needed to recalculate amounts when
-- editing an expense's total, participants, or division.
--
-- This is additive: the existing "splits: owner can update" policy
-- (auth.uid() = user_id) still applies for users updating their own
-- split (e.g. registering a payment).

CREATE POLICY "splits: expense owner can update"
  ON expense_splits FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  (e.paid_by = auth.uid() OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  (e.paid_by = auth.uid() OR e.created_by = auth.uid())
    )
  );
