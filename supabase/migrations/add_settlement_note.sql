-- Agrega campo de nota opcional a la tabla settlements
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS note TEXT;
