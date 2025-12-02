/**
 * Utility script to add deleted_at column to projects table
 * 
 * This script attempts to add the deleted_at column using Supabase RPC
 * However, DDL operations typically require admin access, so you may need to
 * run the SQL directly in the Supabase SQL Editor instead.
 * 
 * To run the migration:
 * 1. Go to your Supabase dashboard
 * 2. Navigate to SQL Editor
 * 3. Run the SQL from supabase/migrations/add_deleted_at_column.sql
 * 
 * Or run this script (if you have service role key):
 * VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key node scripts/add-deleted-at-column.js
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('❌ Missing VITE_SUPABASE_URL environment variable')
  process.exit(1)
}

if (!supabaseServiceRoleKey) {
  console.log('⚠️  VITE_SUPABASE_SERVICE_ROLE_KEY not provided')
  console.log('📝 Please run the SQL migration manually:')
  console.log('   1. Go to your Supabase dashboard')
  console.log('   2. Navigate to SQL Editor')
  console.log('   3. Run the SQL from: supabase/migrations/add_deleted_at_column.sql')
  process.exit(0)
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function addDeletedAtColumn() {
  try {
    console.log('🔄 Attempting to add deleted_at column...')
    
    // Read the migration SQL
    const migrationPath = join(__dirname, '../supabase/migrations/add_deleted_at_column.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    
    // Note: Supabase JS client doesn't support DDL operations directly
    // This would need to be run via the Supabase Management API or SQL Editor
    console.log('⚠️  DDL operations cannot be run via the Supabase JS client')
    console.log('📝 Please run the migration SQL manually in the Supabase SQL Editor:')
    console.log('\n' + migrationSQL + '\n')
    
    // Alternative: Check if column exists by trying to query it
    const { data, error } = await supabase
      .from('projects')
      .select('deleted_at')
      .limit(1)
    
    if (error) {
      if (error.message && error.message.includes('deleted_at')) {
        console.log('✅ Column does not exist - needs to be added')
        console.log('📝 Run the SQL migration in Supabase SQL Editor')
      } else {
        throw error
      }
    } else {
      console.log('✅ Column already exists!')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n📝 Please run the SQL migration manually in the Supabase SQL Editor')
  }
}

addDeletedAtColumn()

