-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create slots table
CREATE TABLE slots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create users table for returning visitors
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    group_id VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create reservations table
CREATE TABLE reservations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slot_id UUID REFERENCES slots(id) ON DELETE CASCADE,
    user_name VARCHAR NOT NULL,
    user_email VARCHAR NOT NULL,
    group_id VARCHAR,
    notes TEXT,
    reference VARCHAR(255) NOT NULL DEFAULT 'N/A',
    status VARCHAR DEFAULT 'confirmed',
    status_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_slots_start_time ON slots(start_time);
CREATE INDEX idx_slots_is_available ON slots(is_available);
CREATE INDEX idx_slots_created_at ON slots(created_at);
CREATE INDEX idx_reservations_slot_id ON reservations(slot_id);
CREATE INDEX idx_reservations_user_email ON reservations(user_email);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_reference ON reservations(reference);
CREATE INDEX idx_reservations_created_at ON reservations(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_slots_updated_at
    BEFORE UPDATE ON slots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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

-- Create function to check slot availability before reservation
CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM slots
        WHERE id = NEW.slot_id
        AND is_available = true
    ) THEN
        RAISE EXCEPTION 'Slot is not available';
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for slot availability check
CREATE TRIGGER check_slot_availability_trigger
    BEFORE INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION check_slot_availability();

-- Create function to update slot availability after reservation
CREATE OR REPLACE FUNCTION update_slot_availability()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE slots
    SET is_available = false
    WHERE id = NEW.slot_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for slot availability update
CREATE TRIGGER update_slot_availability_trigger
    AFTER INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_slot_availability();

-- Create function to generate booking reference
CREATE OR REPLACE FUNCTION generate_booking_reference()
RETURNS TEXT AS $$
DECLARE
    date_part TEXT;
    suffix TEXT;
    characters TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    i INTEGER;
BEGIN
    date_part := to_char(CURRENT_TIMESTAMP, 'YYYYMMDD');
    suffix := '';
    FOR i IN 1..4 LOOP
        suffix := suffix || substr(characters, floor(random() * length(characters) + 1)::integer, 1);
    END LOOP;
    RETURN 'ADR-' || date_part || '-' || suffix;
END;
$$ language 'plpgsql';

-- Create trigger to set booking reference
CREATE OR REPLACE FUNCTION set_booking_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.reference IS NULL THEN
        NEW.reference := generate_booking_reference();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_booking_reference_trigger
    BEFORE INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION set_booking_reference();