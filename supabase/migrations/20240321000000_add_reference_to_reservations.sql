-- First add the reference column
ALTER TABLE reservations
ADD COLUMN reference VARCHAR(255) NOT NULL DEFAULT 'N/A';

-- Then update existing records with 'N/A' reference to have unique references
UPDATE reservations
SET reference = 'ADR-' || to_char(created_at, 'YYYYMMDD') || '-' || substr(id::text, 1, 4)
WHERE reference = 'N/A';

-- Now add the unique constraint
ALTER TABLE reservations
ADD CONSTRAINT unique_reference UNIQUE (reference);

-- Create an index on the reference column for faster lookups
CREATE INDEX idx_reservations_reference ON reservations (reference);