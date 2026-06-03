-- Track how much each participant has contributed toward their split in
-- pending expenses (paid_by = NULL). Supports partial payments: paid_amount
-- accumulates until it reaches the split amount (fully covered).

ALTER TABLE expense_splits
  ADD COLUMN paid_amount integer NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);

-- Only the split owner can record payments against their own split.
CREATE POLICY "splits: owner can update"
  ON expense_splits FOR UPDATE TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
