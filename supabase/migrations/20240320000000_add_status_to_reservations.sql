-- Add status column to reservations table
ALTER TABLE reservations
ADD COLUMN status VARCHAR DEFAULT 'confirmed',
ADD COLUMN status_reason TEXT,
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Create an index for status to improve query performance
CREATE INDEX idx_reservations_status ON reservations(status);

-- Update existing reservations to have a status
UPDATE reservations SET status = 'confirmed' WHERE status IS NULL;