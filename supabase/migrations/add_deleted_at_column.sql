-- Migration: Add deleted_at column to projects table
-- This enables soft delete functionality for projects

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Add a comment to document the column
COMMENT ON COLUMN projects.deleted_at IS 'Timestamp when the project was soft deleted. NULL means the project is active.';

-- Optional: Create an index for faster queries on deleted projects
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

