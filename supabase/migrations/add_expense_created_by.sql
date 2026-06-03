-- Add created_by to expenses so we can distinguish who registered the expense
-- from who paid it (they can be different people).

ALTER TABLE expenses
  ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Backfill existing rows: assume the payer registered the expense
UPDATE expenses SET created_by = paid_by WHERE created_by IS NULL;

ALTER TABLE expenses ALTER COLUMN created_by SET NOT NULL;

-- Allow either the payer OR the creator to delete the expense
DROP POLICY "expenses: payer can delete" ON expenses;
CREATE POLICY "expenses: creator or payer can delete"
  ON expenses FOR DELETE TO authenticated
  USING (auth.uid() = paid_by OR auth.uid() = created_by);

-- Same for expense_splits: cascade delete is handled by FK, but the
-- manual delete policy also needs to allow the creator
DROP POLICY "splits: payer can delete" ON expense_splits;
CREATE POLICY "splits: creator or payer can delete"
  ON expense_splits FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  (e.paid_by = auth.uid() OR e.created_by = auth.uid())
    )
  );
