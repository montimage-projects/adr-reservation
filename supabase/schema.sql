-- Create slots table
CREATE TABLE slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create users table for returning visitors
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    group_id VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create reservations table
CREATE TABLE reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slot_id UUID REFERENCES slots(id),
    user_name VARCHAR NOT NULL,
    user_email VARCHAR NOT NULL,
    group_id VARCHAR,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_slots_start_time ON slots(start_time);
CREATE INDEX idx_slots_is_available ON slots(is_available);
CREATE INDEX idx_reservations_slot_id ON reservations(slot_id);
CREATE INDEX idx_reservations_user_email ON reservations(user_email);

-- Set up Row Level Security (RLS)
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Create policies for slots
CREATE POLICY "Allow public read access to available slots"
    ON slots FOR SELECT
    USING (is_available = true);

CREATE POLICY "Allow authenticated users to manage slots"
    ON slots
    USING (auth.role() = 'authenticated');

-- Create policies for reservations
CREATE POLICY "Allow users to view their own reservations"
    ON reservations FOR SELECT
    USING (user_email = auth.jwt() ->> 'email');

CREATE POLICY "Allow users to create reservations"
    ON reservations FOR INSERT
    WITH CHECK (true);  -- We'll validate slot availability in the application

CREATE POLICY "Allow authenticated users to manage all reservations"
    ON reservations
    USING (auth.role() = 'authenticated');

-- Create policies for users
CREATE POLICY "Allow users to view their own profile"
    ON users FOR SELECT
    USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Allow users to manage their own profile"
    ON users
    USING (email = auth.jwt() ->> 'email');