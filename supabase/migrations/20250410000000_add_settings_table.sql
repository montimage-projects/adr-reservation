-- Create settings table for application configuration
CREATE TABLE settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR NOT NULL UNIQUE,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert admin_password_hash key if it doesn't exist
-- This will be populated by the application when admin sets up password
INSERT INTO settings (key, value)
VALUES ('admin_password_hash', '')
ON CONFLICT (key) DO NOTHING;

-- Set up Row Level Security (RLS)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policy for settings - only authenticated users with admin role can access
CREATE POLICY "Allow authenticated admin users to manage settings"
    ON settings
    USING (auth.role() = 'authenticated');
