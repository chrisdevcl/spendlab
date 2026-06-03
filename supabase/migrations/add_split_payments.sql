-- Individual payment records for pending expense splits.
-- Each call to "Abonar" creates a row here so users can see the full history.

CREATE TABLE split_payments (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid        NOT NULL REFERENCES expense_splits(id) ON DELETE CASCADE,
  amount   integer     NOT NULL CHECK (amount > 0),
  paid_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE split_payments ENABLE ROW LEVEL SECURITY;

-- Group members can read payments for expenses in their groups
CREATE POLICY "split_payments: members can read"
  ON split_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   expense_splits es
      JOIN   expenses e ON e.id = es.expense_id
      WHERE  es.id = split_id
        AND  is_group_member(e.group_id)
    )
  );

-- Only the split owner can record payments against their own split
CREATE POLICY "split_payments: owner can insert"
  ON split_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_splits es
      WHERE  es.id = split_id AND es.user_id = auth.uid()
    )
  );
