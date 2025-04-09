import { adminSupabase } from '../lib/supabase';

/**
 * This utility helps update the Supabase schema
 * Run this script using:
 * node -r esm -r dotenv/config src/utils/updateSchema.js
 */
async function updateSchema() {
  if (!adminSupabase) {
    console.error('Admin Supabase client not available. Make sure your service key is configured in .env.local');
    return;
  }

  console.log('Updating Supabase schema...');

  try {
    // Add reference column to reservations table if it doesn't exist
    const { data, error } = await adminSupabase.rpc('add_column_if_not_exists', {
      _table: 'reservations',
      _column: 'reference',
      _type: 'text'
    });

    if (error) {
      throw error;
    }

    console.log('Schema update successful!');
    console.log('Added reference column to reservations table:', data);

  } catch (error) {
    console.error('Error updating schema:', error);

    // Fallback if RPC doesn't exist - provide SQL for manual execution
    console.log('\nAlternatively, you can run the following SQL in the Supabase SQL editor:');
    console.log('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reference TEXT;');
  }
}

// Only run if executed directly
if (typeof window === 'undefined' && require.main === module) {
  updateSchema()
    .catch(console.error)
    .finally(() => {
      process.exit();
    });
}

export default updateSchema;