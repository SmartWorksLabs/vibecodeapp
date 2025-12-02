/**
 * Utility function to add deleted_at column via Supabase
 * 
 * Note: This requires admin/service role access. For most users,
 * it's easier to run the SQL directly in the Supabase SQL Editor.
 * 
 * SQL to run in Supabase SQL Editor:
 * 
 * ALTER TABLE projects 
 * ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
 * 
 * CREATE INDEX IF NOT EXISTS idx_projects_deleted_at 
 * ON projects(deleted_at) WHERE deleted_at IS NOT NULL;
 */

import { supabase } from '../lib/supabase'

/**
 * Attempts to add the deleted_at column by checking if it exists
 * and providing instructions if it doesn't
 */
export async function checkAndAddDeletedAtColumn() {
  try {
    // Try to query the deleted_at column
    const { data, error } = await supabase
      .from('projects')
      .select('deleted_at')
      .limit(1)
    
    if (error) {
      if (error.message && error.message.includes('deleted_at')) {
        console.warn('⚠️ deleted_at column does not exist in the projects table')
        console.warn('📝 To add it, run this SQL in your Supabase SQL Editor:')
        console.warn(`
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at 
ON projects(deleted_at) WHERE deleted_at IS NOT NULL;
        `)
        return { exists: false, needsMigration: true }
      }
      throw error
    }
    
    console.log('✅ deleted_at column exists')
    return { exists: true, needsMigration: false }
  } catch (error) {
    console.error('Error checking deleted_at column:', error)
    return { exists: false, needsMigration: true, error }
  }
}

