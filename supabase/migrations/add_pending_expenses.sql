-- Allow expenses without a payer yet (pending payment).
-- paid_by = NULL means nobody has paid; each participant owes their split
-- amount to the "world" (not to a specific group member).

ALTER TABLE expenses ALTER COLUMN paid_by DROP NOT NULL;

-- Any group member can now update a pending expense (to claim who paid).
-- Payer/creator can always update their own expense.
DROP POLICY "expenses: payer can update" ON expenses;
CREATE POLICY "expenses: update"
  ON expenses FOR UPDATE TO authenticated
  USING (
    auth.uid() = paid_by
    OR auth.uid() = created_by
    OR (paid_by IS NULL AND is_group_member(group_id))
  )
  WITH CHECK (is_group_member(group_id));
