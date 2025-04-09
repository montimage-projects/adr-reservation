-- Add reference column to reservations table
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reference TEXT;